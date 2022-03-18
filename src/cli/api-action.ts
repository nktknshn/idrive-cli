import { constant, pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Reader'
import * as TE from 'fp-ts/lib/TaskEither'
import { defaultApiEnv } from '../defaults'
import { readAccountData } from '../icloud/authorization/validate'
import * as AM from '../icloud/drive/requests/request'
import { readSessionFile, saveSessionFile } from '../icloud/session/session-file'

export function apiActionM<T>(
  action: () => AM.AuthorizedRequest<T>,
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
