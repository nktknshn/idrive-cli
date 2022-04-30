import { constVoid, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { readAccountData, saveAccountData as _saveAccountData } from '../../icloud/authorization/requests/validate'
import { AccountData } from '../../icloud/authorization/types'
import { Drive, DriveApi } from '../../icloud/drive'
import * as C from '../../icloud/drive/cache/cache'
import { DepAuthorizeSession, DepFs } from '../../icloud/deps/DepFetchClient'
import { DepDriveApi } from '../../icloud/drive/deps'
import { authorizeState } from '../../icloud/drive/deps/authorize'
import { AuthorizedState, BasicState } from '../../icloud/request/request'
import { readSessionFile, saveSession as _saveSession } from '../../icloud/session/session-file'
import { err } from '../../util/errors'
import { ReadJsonFileError } from '../../util/files'
import { loggerIO } from '../../util/loggerIO'
import { cacheLogger } from '../../util/logging'

type Deps =
  & { sessionFile: string }
  & { cacheFile: string; noCache: boolean }
  & DepAuthorizeSession
  & DepFs<'writeFile'>
  & DepFs<'readFile'>

/** read the state from files and executes the action in the context */
export function cliAction<A, R, Args extends unknown[]>(
  action: (...args: Args) => Drive.Effect<A, R>,
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

const loadSession = pipe(
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
  { session }: BasicState,
): RTE.ReaderTaskEither<
  DepAuthorizeSession & { sessionFile: string } & DepFs<'readFile'>,
  Error,
  AuthorizedState
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
        RTE.chain(() => authorizeState({ session })),
      )
    ),
  )

const loadDriveState = pipe(
  loadSession,
  RTE.chain(loadAccountData),
  RTE.bindW('cache', () => loadCache),
)

const loadCache: RTE.ReaderTaskEither<
  {
    noCache: boolean
    cacheFile: string
  } & DepFs<'readFile'>,
  Error | ReadJsonFileError,
  C.Cache
> = RTE.asksReaderTaskEitherW((deps: { noCache: boolean; cacheFile: string }) =>
  pipe(
    deps.noCache
      ? RTE.of(C.cachef())
      : C.tryReadFromFile(deps.cacheFile),
    RTE.orElse(
      (e) => RTE.of(C.cachef()),
    ),
  )
)

export const saveSession = <S extends BasicState>(state: S) =>
  RTE.asksReaderTaskEitherW(
    _saveSession(state.session),
  )

export const saveAccountData = <S extends { accountData: AccountData }>(
  state: S,
) =>
  RTE.asksReaderTaskEitherW((deps: { sessionFile: string }) =>
    _saveAccountData(state.accountData, `${deps.sessionFile}-accountData`)
  )

const saveCache = <S extends { cache: C.Cache }>(state: S) =>
  RTE.asksReaderTaskEitherW((deps: { cacheFile: string; noCache: boolean }) =>
    deps.noCache
      ? RTE.of(constVoid())
      : C.trySaveFile(state.cache)(deps.cacheFile)
  )
