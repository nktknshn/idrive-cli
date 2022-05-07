import { constant, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { DepFetchClient, DepFs } from '../deps-types'
import { readAccountData } from '../icloud-authorization'
import * as AM from '../icloud-core/icloud-request'
import { readSessionFile, saveSession } from '../icloud-core/session/session-file'

export function apiActionM<T, R>(
  action: () => AM.ApiRequest<T, AM.AuthorizedState, R>,
): RTE.ReaderTaskEither<
  & { sessionFile: string }
  & DepFs<'writeFile' | 'readFile'>
  & DepFetchClient
  & R,
  Error,
  T
> {
  return pipe(
    RTE.ask<{ sessionFile: string } & DepFs<'writeFile' | 'readFile'>>(),
    RTE.bindTo('deps'),
    RTE.bindW('session', ({ deps }) => readSessionFile(deps)),
    RTE.bindW('accountData', ({ deps }) => readAccountData(`${deps.sessionFile}-accountData`)),
    RTE.chainW(({ accountData, deps, session }) =>
      pipe(
        action()({ accountData, session }),
        RTE.chainW(
          ([result, { session, accountData }]) =>
            pipe(
              saveSession(session)(deps)(deps),
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
