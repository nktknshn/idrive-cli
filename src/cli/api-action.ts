import * as E from 'fp-ts/lib/Either'
import { constant, pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Reader'
import * as T from 'fp-ts/lib/Task'
import * as TE from 'fp-ts/lib/TaskEither'
import { defaultApiEnv } from '../defaults'
import { AccountLoginResponseBody } from '../icloud/authorization/types'
import { readAccountData } from '../icloud/authorization/validate'
import * as AM from '../icloud/drive/requests/reader'
import { ICloudSession } from '../icloud/session/session'
import { readSessionFile, saveSessionFile } from '../icloud/session/session-file'
import { fetchClient } from '../lib/http/fetch-client'
import { input } from '../lib/input'

// export function apiActionM<T>(
//   action: (
//     deps: { api: DriveApi.DriveApi; session: ICloudSession; accountData: AccountLoginResponseBody },
//   ) => TE.TaskEither<Error, T>,
// ): R.Reader<{ sessionFile: string }, TE.TaskEither<Error, T>> {
//   return pipe(
//     R.ask<{ sessionFile: string }>(),
//     R.map(({ sessionFile }) =>
//       pipe(
//         TE.Do,
//         TE.bind('session', () => readSessionFile(sessionFile)),
//         TE.bind('accountData', () => readAccountData(`${sessionFile}-accountData`)),
//         TE.bind('api', (validatedSession) => TE.of(new DriveApi.DriveApi(validatedSession))),
//         TE.bind('result', ({ api, session, accountData }) =>
//           TE.bracket(
//             TE.of({ api, session, accountData }),
//             () => action({ api, session, accountData }),
//             ({ api }, e) =>
//               pipe(
//                 saveSession(sessionFile)(api.getSession().session),
//                 // logReturn(() => stderrLogger.info(JSON.stringify({ apiCalls: api.apiCalls }))),
//               ),
//           )),
//         TE.map((_) => _.result),
//       )
//     ),
//   )
// }

export function apiActionM<T>(
  action: () => AM.DriveApiRequest<T>,
): R.Reader<{ sessionFile: string }, TE.TaskEither<Error, T>> {
  return pipe(
    R.ask<{ sessionFile: string }>(),
    R.map(({ sessionFile }) =>
      pipe(
        TE.Do,
        TE.bind('session', () => readSessionFile(sessionFile)),
        TE.bind('accountData', () => readAccountData(`${sessionFile}-accountData`)),
        TE.chain((session) => action()(session)(defaultApiEnv)),
        TE.chain(
          ([result, { session, accountData }]) =>
            pipe(
              saveSessionFile(sessionFile)(session),
              TE.map(constant(result)),
            ),
        ),
      )
    ),
  )
}
