import { constVoid, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as O from 'fp-ts/Option'
import { DepFs } from '../../deps-types'
import { DepAuthenticateSession } from '../../deps-types/dep-authenticate-session'
import { type AccountData, readAccountData, saveAccountData as _saveAccountData } from '../../icloud-authentication'
import { authenticateState } from '../../icloud-authentication/methods'
import { AuthenticatedState, BaseState } from '../../icloud-core/icloud-request'
import { readSessionFile, saveSession as _saveSession } from '../../icloud-core/session/session-file'
import { Cache, DriveLookup } from '../../icloud-drive'
import { debugTimeRTE } from '../../logging/debug-time'
import { loggerIO } from '../../logging/loggerIO'
import { cacheLogger } from '../../logging/logging'
import { err } from '../../util/errors'
import { ReadJsonFileError } from '../../util/files'

type Deps =
  & { sessionFile: string }
  & { cacheFile: string; noCache: boolean }
  & DepAuthenticateSession
  & DepFs<'writeFile'>
  & DepFs<'readFile'>

/** read the state from files and executes the action in the context */
export function driveCommand<A, R, Args extends unknown[]>(
  action: (...args: Args) => DriveLookup.Monad<A, R>,
): (...args: Args) => RTE.ReaderTaskEither<R & Deps, Error, A> {
  return (...args: Args) =>
    pipe(
      loadDriveState,
      RTE.bindW('result', action(...args)),
      RTE.chainFirst(({ cache: oldCache, result: [, { cache }] }) =>
        RTE.fromIO(
          () =>
            cacheLogger.debug(
              `saving cache: ${Object.keys(cache.byDrivewsid).length} items`
                + `\n${Object.keys(cache.byDrivewsid).length - Object.keys(oldCache.byDrivewsid).length} new items`,
            ),
        )
      ),
      RTE.chainFirstW(({ result: [, state] }) =>
        pipe(
          RTE.of(state),
          RTE.chainFirstW(saveSession),
          RTE.chainFirstW(saveAccountData),
          RTE.chainFirstW(saveCache),
        )
      ),
      RTE.map(_ => _.result[0]),
    )
}

export const loadSession = pipe(
  RTE.asksReaderTaskEitherW(
    readSessionFile,
  ),
  RTE.orElse(
    (e) =>
      ({ sessionFile }) =>
        TE.left(
          err(
            `Couldn't read session file from '${sessionFile}' (${e}).`
              + `\nInit new session file by using command\n`
              + `\nidrive init -s ${sessionFile}`,
          ),
        ),
  ),
  RTE.map(session => ({ session })),
)

const loadAccountData = (
  { session }: BaseState,
): RTE.ReaderTaskEither<
  DepAuthenticateSession & { sessionFile: string } & DepFs<'readFile'>,
  Error,
  AuthenticatedState
> =>
  pipe(
    RTE.asksReaderTaskEitherW(
      (deps: { sessionFile: string }) => readAccountData(`${deps.sessionFile}-accountData`),
    ),
    RTE.map(accountData => ({ session, accountData })),
    RTE.orElseW(e =>
      pipe(
        loggerIO.error(`couldn't read account data from file. (${e}). Fetching from the icloud server`),
        RTE.fromIO,
        RTE.chain(() => authenticateState({ session })),
      )
    ),
  )

const loadDriveState = pipe(
  loadSession,
  debugTimeRTE('loadSession'),
  RTE.chain(loadAccountData),
  debugTimeRTE('loadAccountData'),
  RTE.bindW('cache', () => pipe(loadCache, debugTimeRTE('loadCache'))),
  RTE.bindW('tempCache', () => RTE.of(O.none)),
)

const loadCache: RTE.ReaderTaskEither<
  {
    noCache: boolean
    cacheFile: string
  } & DepFs<'readFile'>,
  Error | ReadJsonFileError,
  Cache.LookupCache
> = RTE.asksReaderTaskEitherW((deps: { noCache: boolean; cacheFile: string }) =>
  pipe(
    deps.noCache
      ? RTE.of(Cache.cachef())
      : Cache.tryReadFromFile(deps.cacheFile),
    RTE.orElse(
      (e) => RTE.of(Cache.cachef()),
    ),
  )
)

export const saveSession = <S extends BaseState>(
  state: S,
): RTE.ReaderTaskEither<{ sessionFile: string } & DepFs<'writeFile'>, Error, void> =>
  pipe(
    RTE.asksReaderTaskEitherW(
      _saveSession(state.session),
    ),
    debugTimeRTE('saveSession'),
  )

export const saveAccountData = <S extends { accountData: AccountData }>(
  state: S,
): RTE.ReaderTaskEither<{ sessionFile: string } & DepFs<'writeFile'>, Error, void> =>
  pipe(
    RTE.asksReaderTaskEitherW((deps: { sessionFile: string }) =>
      _saveAccountData(state.accountData, `${deps.sessionFile}-accountData`)
    ),
    debugTimeRTE('saveAccountData'),
  )

const saveCache = <S extends { cache: Cache.LookupCache }>(state: S) =>
  pipe(
    RTE.asksReaderTaskEitherW((deps: { cacheFile: string; noCache: boolean }) =>
      deps.noCache
        ? RTE.of(constVoid())
        : Cache.trySaveFile(state.cache)(deps.cacheFile)
    ),
    debugTimeRTE('saveCache'),
  )
