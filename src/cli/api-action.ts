import { pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Reader'
import * as TE from 'fp-ts/lib/TaskEither'
import { AccountLoginResponseBody } from '../icloud/authorization/types'
import { readAccountData } from '../icloud/authorization/validate'
import * as DriveApi from '../icloud/drive/drive-api'
import { ICloudSession } from '../icloud/session/session'
import { readSessionFile, saveSession } from '../icloud/session/session-file'

export function apiActionM<T>(
  action: (
    deps: { api: DriveApi.DriveApi; session: ICloudSession; accountData: AccountLoginResponseBody },
  ) => TE.TaskEither<Error, T>,
): R.Reader<{ sessionFile: string }, TE.TaskEither<Error, T>> {
  return pipe(
    R.ask<{ sessionFile: string }>(),
    R.map(({ sessionFile }) =>
      pipe(
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
                // logReturn(() => stderrLogger.info(JSON.stringify({ apiCalls: api.apiCalls }))),
              ),
          )),
        TE.map((_) => _.result),
      )
    ),
  )
}
