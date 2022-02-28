import { log } from 'fp-ts/lib/Console'
import { constVoid, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { fromIO } from 'fp-ts/lib/Task'
import * as TE from 'fp-ts/lib/TaskEither'
import { readAccountData } from '../icloud/authorization/validate'
import * as C from '../icloud/drive/cache/cache'
import { CacheF } from '../icloud/drive/cache/cache-types'
import * as DF from '../icloud/drive/drive'
import { ICloudSession } from '../icloud/session/session'
import { readSessionFile, saveSession2 } from '../icloud/session/session-file'
import { apiLogger, logReturnAs } from '../lib/logging'

const getSessionFile = (deps: { sessionFile: string }) => readSessionFile(deps.sessionFile)

const getAccountData = (deps: { sessionFile: string }) => readAccountData(`${deps.sessionFile}-accountData`)

const getCache = (deps: { noCache: boolean; cacheFile: string }) =>
  pipe(
    deps.noCache
      ? TE.of(C.cachef())
      : C.tryReadFromFile(deps.cacheFile),
    TE.orElseW(
      (e) => pipe(e, logReturnAs('error'), () => TE.of(C.cachef())),
    ),
  )

const saveSession = <S extends { session: ICloudSession }>(state: S) =>
  (deps: { sessionFile: string }) => saveSession2(state.session)(deps.sessionFile)

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
    RTE.bind('session', () => getSessionFile),
    RTE.bind('accountData', () => getAccountData),
    RTE.bindW('cache', () => getCache),
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
