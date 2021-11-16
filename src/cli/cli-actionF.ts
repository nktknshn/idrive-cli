import * as E from 'fp-ts/lib/Either'
import { constVoid, pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { AccountLoginResponseBody } from '../icloud/authorization/types'
import { readAccountData } from '../icloud/authorization/validate'
import * as C from '../icloud/drive/cache/cachef'
import { InconsistentCache } from '../icloud/drive/cache/errors'
import * as DriveApi from '../icloud/drive/drive-api'
import { ICloudSession } from '../icloud/session/session'
import { readSessionFile, saveSession } from '../icloud/session/session-file'
import { logReturn, stderrLogger } from '../lib/logging'
import { EnvFiles } from './types'

export function cliAction<Args, T>(
  { sessionFile, cacheFile, noCache, dontSaveCache = false }: EnvFiles & { noCache: boolean; dontSaveCache?: boolean },
  f: (deps: { cache: C.Cache; api: DriveApi.DriveApi }) => TE.TaskEither<Error, T>,
): TE.TaskEither<Error, T> {
  return pipe(
    TE.Do,
    TE.bind('session', () => readSessionFile(sessionFile)),
    TE.bind('accountData', () => readAccountData(`${sessionFile}-accountData`)),
    TE.bind('api', (validatedSession) => TE.of(new DriveApi.DriveApi(validatedSession))),
    TE.bindW('cache', ({ api }) =>
      pipe(
        noCache
          ? TE.of(C.Cache.create())
          : pipe(C.Cache.tryReadFromFile(cacheFile), TE.map(C.Cache.create)),
        TE.orElseW((e) => TE.of(C.Cache.create())),
      )),
    // TE.bindW('drive', ({ api, cache }) => TE.of(new Drive.Drive(api, cache))),
    TE.bind('result', ({ api, cache }) =>
      TE.bracket(
        TE.of({ api }),
        () => f({ cache, api }),
        ({ api }, e) =>
          pipe(
            saveSession(sessionFile)(api.getSession().session),
            TE.chain(() =>
              (E.isLeft(e) && InconsistentCache.is(e.left)) || noCache || dontSaveCache
                ? TE.of(constVoid())
                : C.Cache.trySaveFile(cache, cacheFile)
            ),
            logReturn(() => stderrLogger.info({ apiCalls: api.apiCalls })),
          ),
      )),
    TE.map((_) => _.result),
  )
}

export function apiAction<T>(
  { sessionFile }: { sessionFile: string },
  action: (
    deps: { api: DriveApi.DriveApi; session: ICloudSession; accountData: AccountLoginResponseBody },
  ) => TE.TaskEither<Error, T>,
): TE.TaskEither<Error, T> {
  return pipe(
    TE.Do,
    TE.bind('session', () => readSessionFile(sessionFile)),
    TE.bind('accountData', () => readAccountData(`${sessionFile}-accountData`)),
    TE.bind('api', (validatedSession) => TE.of(new DriveApi.DriveApi(validatedSession))),
    TE.bind('result', ({ api, session, accountData }) =>
      TE.bracket(
        TE.of({ api, session, accountData }),
        () => action({ api, session, accountData }),
        ({ api }, e) =>
          pipe(
            saveSession(sessionFile)(api.getSession().session),
            logReturn(() => stderrLogger.info({ apiCalls: api.apiCalls })),
          ),
      )),
    TE.map((_) => _.result),
  )
}

// type CliAction2Deps = {}

// type Dep<R, A> = RTE.ReaderTaskEither<R, Error, A>

// export function cliAction2<R>(): TE.TaskEither<Error, R> {
//   return pipe(
//     TE.Do,
//   )
// }
