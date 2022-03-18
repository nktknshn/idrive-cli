import { constVoid, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { AccountLoginResponseBody } from '../icloud/authorization/types'
import { readAccountData, saveAccountData as _saveAccountData } from '../icloud/authorization/validate'
import { SchemaEnv } from '../icloud/drive/api/deps'
import * as API from '../icloud/drive/api/methods'
import { ApiDepsType, Dep } from '../icloud/drive/api/type'
import * as C from '../icloud/drive/cache/cache'
import { CacheF } from '../icloud/drive/cache/cache-types'
import * as DF from '../icloud/drive/drive'
import { RequestEnv } from '../icloud/drive/requests/request'
import { ICloudSession } from '../icloud/session/session'
import { readSessionFile, saveSession2 } from '../icloud/session/session-file'
import { err } from '../lib/errors'
import { Getcode } from '../lib/input'
import { loggerIO } from '../lib/loggerIO'
import { apiLogger, logReturnAs } from '../lib/logging'
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

export const saveAccountData = <S extends { accountData: AccountLoginResponseBody }>(
  state: S,
) => (deps: { sessionFile: string }) => _saveAccountData(state.accountData, `${deps.sessionFile}-accountData`)

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
        RTE.chain(() => API.authorizeStateM3({ session })),
        // RTE.ask<Use<'authorizeSessionM'>>(),
        // RTE.chainW(({ authorizeSessionM }) => authorizeSessionM()({ session })),
        // RTE.map(([accountData, { session }]) => ({ session, accountData })),
      )
    ),
  )

/** read the state and execute an action in the context */
export function cliActionM2<A, R extends ApiDepsType & SchemaEnv>(
  action: () => XXX<DF.State, R, A>,
): RTE.ReaderTaskEither<
  & R
  & { sessionFile: string }
  & { cacheFile: string; noCache: boolean },
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
