import { log } from 'fp-ts/lib/Console'
import { constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { fromIO } from 'fp-ts/lib/Task'
import * as TE from 'fp-ts/lib/TaskEither'
import { AuthorizedState, authorizeStateM3 } from '../icloud/authorization/authorize'
import { AccountLoginResponseBody } from '../icloud/authorization/types'
import { readAccountData, saveAccountData } from '../icloud/authorization/validate'
import { ApiEnv } from '../icloud/drive/api'
import { ApiType } from '../icloud/drive/api/type'
import * as C from '../icloud/drive/cache/cache'
import { CacheF } from '../icloud/drive/cache/cache-types'
import * as DF from '../icloud/drive/drive'
import { RequestEnv } from '../icloud/drive/requests/request'
import { ICloudSession } from '../icloud/session/session'
import { readSessionFile, saveSession2 } from '../icloud/session/session-file'
import { err } from '../lib/errors'
import { loggerIO } from '../lib/loggerIO'
import { apiLogger, logger, logReturnAs } from '../lib/logging'
import { XXX } from '../lib/types'

export const loadSessionFile = (deps: { sessionFile: string }) => readSessionFile(deps.sessionFile)

export const _loadAccountData = (deps: { sessionFile: string }) =>
  pipe(
    readAccountData(`${deps.sessionFile}-accountData`),
  )

export const loadCache = (deps: { noCache: boolean; cacheFile: string }) =>
  pipe(
    deps.noCache
      ? TE.of(C.cachef())
      : C.tryReadFromFile(deps.cacheFile),
    TE.orElseW(
      (e) => pipe(e, logReturnAs('error'), () => TE.of(C.cachef())),
    ),
  )

export const saveSession = <S extends { session: ICloudSession }>(state: S) =>
  (deps: { sessionFile: string }) => saveSession2(state.session)(deps.sessionFile)

export const saveAccountData2 = <S extends { accountData: AccountLoginResponseBody }>(
  state: S,
) => (deps: { sessionFile: string }) => saveAccountData(state.accountData, `${deps.sessionFile}-accountData`)

export const saveCache = <S extends { cache: CacheF }>(state: S) =>
  (deps: { cacheFile: string; noCache: boolean }) =>
    deps.noCache
      ? TE.of(constVoid())
      : C.trySaveFile(state.cache)(deps.cacheFile)

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
)
const loadAccountData = (
  session: ICloudSession,
) =>
  pipe(
    _loadAccountData,
    RTE.map(accountData => ({ session, accountData })),
    RTE.orElseW(e =>
      pipe(
        loggerIO.error(`error ${e.name} while reading account data.`),
        RTE.fromIO,
        RTE.chain(() => authorizeStateM3({ session })),
      )
    ),
  )

const getAuthorizedState: RTE.ReaderTaskEither<
  { sessionFile: string } & ApiEnv & RequestEnv,
  Error,
  AuthorizedState
> = pipe(
  loadSession,
  RTE.chain(loadAccountData),
)

/** read the state and execute an action in the context */
export function cliActionM2<T, R extends DF.DriveMEnv & ApiType>(
  action: () => XXX<DF.State, R, T>,
) {
  return pipe(
    getAuthorizedState,
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
        RTE.chainFirstW(saveAccountData2),
        RTE.chainFirstW(saveCache),
      )
    ),
    RTE.map(_ => _.result[0]),
  )
}
