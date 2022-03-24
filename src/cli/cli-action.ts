import { constVoid, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { AccountData } from '../icloud/authorization/types'
import { readAccountData, saveAccountData as _saveAccountData } from '../icloud/authorization/validate'
import { Drive } from '../icloud/drive'
import * as C from '../icloud/drive/cache/cache'
import { CacheF } from '../icloud/drive/cache/cache-types'
import * as API from '../icloud/drive/deps/api-methods'
import { DepApi, DepFs } from '../icloud/drive/deps/deps'
import { ICloudSession } from '../icloud/session/session'
import { readSessionFile, saveSession2 } from '../icloud/session/session-file'
import { err } from '../lib/errors'
import { ReadJsonFileError } from '../lib/files'
import { loggerIO } from '../lib/loggerIO'
import { apiLogger } from '../lib/logging'
import { XXX } from '../lib/types'

export const loadSessionFile = RTE.asksReaderTaskEitherW(
  (deps: { sessionFile: string }) => readSessionFile(deps.sessionFile),
)

export const _loadAccountData = RTE.asksReaderTaskEitherW(
  (deps: { sessionFile: string }) => readAccountData(`${deps.sessionFile}-accountData`),
)

export const loadCache: RTE.ReaderTaskEither<
  {
    noCache: boolean
    cacheFile: string
  } & DepFs<'readFile'>,
  Error | ReadJsonFileError,
  CacheF
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

export const saveSession = <S extends { session: ICloudSession }>(state: S) =>
  RTE.asksReaderTaskEitherW((deps: { sessionFile: string }) => saveSession2(state.session)(deps.sessionFile))

export const saveAccountData = <S extends { accountData: AccountData }>(
  state: S,
) =>
  RTE.asksReaderTaskEitherW((deps: { sessionFile: string }) =>
    _saveAccountData(state.accountData, `${deps.sessionFile}-accountData`)
  )

export const saveCache = <S extends { cache: CacheF }>(state: S) =>
  RTE.asksReaderTaskEitherW((deps: { cacheFile: string; noCache: boolean }) =>
    deps.noCache
      ? RTE.of(constVoid())
      : C.trySaveFile(state.cache)(deps.cacheFile)
  )

const loadSession = pipe(
  loadSessionFile,
  RTE.orElse(
    (e) =>
      ({ sessionFile }) =>
        TE.left(
          err(
            `Couldn't read session file from '${sessionFile}' (${e}). Init new session file by using command\nidrive init -s ${sessionFile}`,
          ),
        ),
  ),
  RTE.map(session => ({ session })),
)

const loadAccountData = (
  { session }: { session: ICloudSession },
) =>
  pipe(
    _loadAccountData,
    RTE.map(accountData => ({ session, accountData })),
    RTE.orElseW(e =>
      pipe(
        loggerIO.error(`couldn't read account data. (${e})`),
        RTE.fromIO,
        RTE.chain(() => API.authorizeState({ session })),
      )
    ),
  )

export type DriveActionDeps =
  & { sessionFile: string }
  & { cacheFile: string; noCache: boolean }
  & DepApi<'authorizeSession'>
  & DepFs<'writeFile'>
  & DepFs<'readFile'>

/** read the state and execute an action in the context */
export function driveAction<A, R>(
  action: () => XXX<Drive.State, R, A>,
): RTE.ReaderTaskEither<
  & R
  & DriveActionDeps,
  Error,
  A
> {
  return pipe(
    loadSession,
    RTE.chain(loadAccountData),
    RTE.bindW('cache', () => loadCache),
    RTE.bindW('result', action()),
    RTE.chainFirst(({ result: [, { cache }] }) =>
      RTE.fromIO(
        () => apiLogger.debug(`saving cache: ${Object.keys(cache.byDrivewsid).length} items`),
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
