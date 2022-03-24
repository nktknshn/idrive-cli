import { constant, pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Reader'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { defaultApiEnv } from '../defaults'
import { readAccountData } from '../icloud/authorization/validate'
import { DepFetchClient, DepFs } from '../icloud/drive/deps/deps'
import * as AM from '../icloud/drive/requests/request'
import { readSessionFile, saveSession } from '../icloud/session/session-file'

export function apiActionM<T>(
  action: () => AM.AuthorizedRequest<T>,
): RTE.ReaderTaskEither<
  & { sessionFile: string }
  & DepFs<'writeFile' | 'readFile'>
  & DepFetchClient,
  Error,
  T
> {
  return pipe(
    RTE.ask<{ sessionFile: string } & DepFs<'writeFile' | 'readFile'>>(),
    RTE.bindTo('deps'),
    RTE.bindW('session', ({ deps }) => readSessionFile(deps.sessionFile)),
    RTE.bindW('accountData', ({ deps }) => readAccountData(`${deps.sessionFile}-accountData`)),
    RTE.chainW(({ accountData, deps, session }) =>
      pipe(
        action()({ accountData, session }),
        RTE.chainW(
          ([result, { session, accountData }]) =>
            pipe(
              saveSession(session)(deps.sessionFile)(deps),
              TE.map(constant(result)),
              RTE.fromTaskEither,
            ),
        ),
      )
    ),
  )
}
// R.ask<{ sessionFile: string } & DepFs<'writeFile'>>(),
// R.map(({ sessionFile, writeFile }) =>
//   pipe(
//     TE.Do,
//     TE.bind('session', () => readSessionFile(sessionFile)),
//     TE.bind('accountData', () => readAccountData(`${sessionFile}-accountData`)),
//     TE.chain((session) => action()(session)(defaultApiEnv)),
//     TE.chain(
//       ([result, { session, accountData }]) =>
//         pipe(
//           saveSession2(session)(sessionFile)({ writeFile }),
//           TE.map(constant(result)),
//         ),
//     ),
//   )
// ),
// }
