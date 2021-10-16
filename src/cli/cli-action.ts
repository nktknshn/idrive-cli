import * as E from 'fp-ts/lib/Either'
import { constVoid, pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { readAccountData } from '../icloud/authorization/validate'
import * as C from '../icloud/drive/cache/cachef'
import { InconsistentCache } from '../icloud/drive/cache/errors'
import * as Drive from '../icloud/drive/drive'
import * as DriveApi from '../icloud/drive/drive-api'
import { readSessionFile, saveSession } from '../icloud/session/session-file'
import { EnvFiles } from './types'

export function cliAction<T>(
  { sessionFile, cacheFile, noCache }: EnvFiles & { noCache: boolean },
  f: (deps: { drive: Drive.Drive }) => TE.TaskEither<Error, T>,
): TE.TaskEither<Error, T> {
  return pipe(
    TE.Do,
    TE.bind('session', () => readSessionFile(sessionFile)),
    TE.bind('accountData', () => readAccountData(`${sessionFile}-accountData`)),
    TE.bind('api', (validatedSession) => TE.of(new DriveApi.DriveApi(validatedSession))),
    TE.bindW('drive', ({ api }) =>
      pipe(
        noCache
          ? TE.of(C.Cache.create())
          : pipe(C.Cache.tryReadFromFile(cacheFile), TE.map(C.Cache.create)),
        TE.orElseW((e) => TE.of(C.Cache.create())),
        TE.chain((cache) => TE.of(new Drive.Drive(api, cache))),
      )),
    TE.bind('result', ({ drive, api }) =>
      TE.bracket(
        TE.of({ drive, api }),
        () => f({ drive }),
        ({ drive, api }, e) =>
          pipe(
            saveSession(sessionFile)(api.getSession().session),
            TE.chain(() =>
              (E.isLeft(e) && InconsistentCache.is(e.left)) || noCache
                ? TE.of(constVoid())
                : C.Cache.trySaveFile(drive.cacheGet(), cacheFile)
            ),
          ),
      )),
    TE.map((_) => _.result),
  )
}
