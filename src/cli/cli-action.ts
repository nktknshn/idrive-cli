import { log } from 'fp-ts/lib/Console'
import { constVoid, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { fromIO } from 'fp-ts/lib/Task'
import * as TE from 'fp-ts/lib/TaskEither'
import { AccountLoginResponseBody } from '../icloud/authorization/types'
import { readAccountData, saveAccountData } from '../icloud/authorization/validate'
import * as C from '../icloud/drive/cache/cache'
import { CacheF } from '../icloud/drive/cache/cache-types'
import * as DF from '../icloud/drive/drive'
import { ICloudSession } from '../icloud/session/session'
import { readSessionFile, saveSession2 } from '../icloud/session/session-file'
import { apiLogger, logReturnAs } from '../lib/logging'

export const loadSessionFile = (deps: { sessionFile: string }) => readSessionFile(deps.sessionFile)

export const loadAccountData = (deps: { sessionFile: string }) => readAccountData(`${deps.sessionFile}-accountData`)

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

const saveCache = <S extends { cache: CacheF }>(state: S) =>
  (deps: { cacheFile: string; noCache: boolean }) =>
    deps.noCache
      ? TE.of(constVoid())
      : C.trySaveFile(state.cache)(deps.cacheFile)

/** read the state and execute an action in the context */
export function cliActionM2<T>(
  action: () => DF.DriveM<T>,
) {
  return pipe(
    RTE.Do,
    RTE.bind('session', () => loadSessionFile),
    RTE.bind('accountData', () => loadAccountData),
    RTE.bindW('cache', () => loadCache),
    RTE.bindW('result', action()),
    RTE.chainFirst(({ cache }) =>
      RTE.fromIO(
        () => apiLogger.debug(`saving cache: ${Object.keys(cache.byDrivewsid).length} items`),
      )
    ),
    RTE.chainFirstW(({ result: [, result] }) =>
      pipe(
        RTE.of(result),
        RTE.chainFirstW(saveSession),
        RTE.chainFirstW(saveCache),
      )
    ),
    RTE.map(_ => _.result[0]),
  )
}
