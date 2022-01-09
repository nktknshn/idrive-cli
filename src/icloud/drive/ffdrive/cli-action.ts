import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { logReturnAs } from '../../../lib/logging'
import { readAccountData } from '../../authorization/validate'
import { ICloudSession } from '../../session/session'
import { readSessionFile, saveSession2 } from '../../session/session-file'
import * as C from '../cache/cache'
import { CacheF } from '../cache/cache-types'
import * as DF from '../ffdrive'

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
  (deps: { cacheFile: string }) => C.trySaveFile(state.cache)(deps.cacheFile)

export function cliActionM2<T>(
  action: () => DF.DriveM<T>,
) {
  return pipe(
    RTE.Do,
    RTE.bind('session', () => getSessionFile),
    RTE.bind('accountData', () => getAccountData),
    RTE.bindW('cache', () => getCache),
    RTE.bindW('result', action()),
    RTE.chainFirstW(
      ({ result: [, { session }] }) => saveSession({ session }),
    ),
    RTE.chainFirstW(saveCache),
    RTE.map(_ => _.result[0]),
  )
}

// export function cliActionM2<T>(
//   action: () => DF.DriveM<T>,
// ): R.Reader<EnvFiles & { noCache: boolean }, TE.TaskEither<Error, T>> {
//   return (({ sessionFile, cacheFile, noCache }) =>
//     pipe(
//       TE.Do,
//       TE.bind('session', () => readSessionFile(sessionFile)),
//       TE.bind('accountData', () => readAccountData(`${sessionFile}-accountData`)),
//       TE.bindW('cache', ({}) =>
//         pipe(
//           noCache
//             ? TE.of(C.cachef())
//             : pipe(C.tryReadFromFile(cacheFile)),
//           TE.orElseW((e) => pipe(e, logReturnAs('error'), () => TE.of(C.cachef()))),
//         )),
//       TE.chain(({ cache, session, accountData }) =>
//         pipe(
//           action()({ cache, session, accountData })(defaultApiEnv),
//           T.chain(
//             E.fold(
//               ({ error, state: { session, cache } }) =>
//                 pipe(
//                   saveSession(sessionFile)(session),
//                   TE.chain(() => C.trySaveFile(cache, cacheFile)),
//                   () => TE.left(error),
//                 ),
//               ([result, { session, cache }]) =>
//                 pipe(
//                   saveSession(sessionFile)(session),
//                   TE.chain(() => C.trySaveFile(cache, cacheFile)),
//                   TE.map(constant(result)),
//                 ),
//             ),
//           ),
//         )
//       ),
//     ))
// }
