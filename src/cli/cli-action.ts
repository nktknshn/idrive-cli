// import { pipe } from 'fp-ts/lib/function'
// import * as R from 'fp-ts/lib/Reader'
// import * as TE from 'fp-ts/lib/TaskEither'
// import { ICloudSessionValidated } from '../icloud/authorization/authorize'
// import { AccountLoginResponseBody } from '../icloud/authorization/types'
// import { readAccountData } from '../icloud/authorization/validate'
// import * as C from '../icloud/drive/cache/cache'
// // import * as DriveApi from '../icloud/drive/drive-api'
// import { ICloudSession } from '../icloud/session/session'
// import { readSessionFile, saveSession } from '../icloud/session/session-file'
// import { logReturnAs } from '../lib/logging'
// import { EnvFiles } from './types'

// // export function cliAction<Args, T>(
// //   { sessionFile, cacheFile, noCache }: EnvFiles & { noCache: boolean },
// //   f: (deps: { cache: C.Cache; api: DriveApi.DriveApi }) => TE.TaskEither<Error, T>,
// // ): TE.TaskEither<Error, T> {
// //   return pipe(
// //     TE.Do,
// //     TE.bind('session', () => readSessionFile(sessionFile)),
// //     TE.bind('accountData', () => readAccountData(`${sessionFile}-accountData`)),
// //     TE.bind('api', (validatedSession) => TE.of(new DriveApi.DriveApi(validatedSession))),
// //     TE.bindW('cache', ({ api }) =>
// //       pipe(
// //         noCache
// //           ? TE.of(C.cachef())
// //           : pipe(C.tryReadFromFile(cacheFile)),
// //         TE.orElseW((e) => pipe(e, logReturnAs('error'), () => TE.of(C.cachef()))),
// //       )),
// //     // TE.bindW('drive', ({ api, cache }) => TE.of(new Drive.Drive(api, cache))),
// //     TE.bind('result', ({ api, cache }) =>
// //       TE.bracket(
// //         TE.of({ api }),
// //         () => f({ cache, api }),
// //         ({ api }, e) =>
// //           pipe(
// //             saveSession(sessionFile)(api.getSession().session),
// //             // TE.chain(() =>
// //             //   (E.isLeft(e) && InconsistentCache.is(e.left)) || noCache || dontSaveCache
// //             //     ? TE.of(constVoid())
// //             //     : Cache.trySaveFile(cache, cacheFile)
// //             // ),
// //             // logReturn(() => stderrLogger.info(`apiCalls: ${JSON.stringify(api.apiCalls)}`)),
// //           ),
// //       )),
// //     TE.map((_) => _.result),
// //   )
// // }

// export function cliActionM<T>(
//   action: (
//     deps: { cache: C.Cache; api: DriveApi.DriveApi; session: ICloudSession; accountData: AccountLoginResponseBody },
//   ) => TE.TaskEither<Error, T>,
// ): R.Reader<EnvFiles & { noCache: boolean }, TE.TaskEither<Error, T>> {
//   return pipe(
//     R.ask<EnvFiles & { noCache: boolean }>(),
//     R.map(
//       ({ sessionFile, cacheFile, noCache }) =>
//         pipe(
//           TE.Do,
//           TE.bind('session', () => readSessionFile(sessionFile)),
//           TE.bind('accountData', () => readAccountData(`${sessionFile}-accountData`)),
//           TE.bind('api', (validatedSession) => TE.of(new DriveApi.DriveApi(validatedSession))),
//           TE.bindW('cache', ({ api }) =>
//             pipe(
//               noCache
//                 ? TE.of(C.cachef())
//                 : pipe(C.tryReadFromFile(cacheFile)),
//               TE.orElseW((e) => pipe(e, logReturnAs('error'), () => TE.of(C.cachef()))),
//             )),
//           // TE.bindW('drive', ({ api, cache }) => TE.of(new Drive.Drive(api, cache))),
//           TE.bind('result', ({ api, cache, session, accountData }) =>
//             TE.bracket(
//               TE.of({ api }),
//               () => action({ cache, api, session, accountData }),
//               ({ api }, e) =>
//                 pipe(
//                   saveSession(sessionFile)(api.getSession().session),
//                   // TE.chain(() =>
//                   //   (E.isLeft(e) && InconsistentCache.is(e.left)) || noCache || dontSaveCache
//                   //     ? TE.of(constVoid())
//                   //     : Cache.trySaveFile(cache, cacheFile)
//                   // ),
//                   // logReturn(() => stderrLogger.info(`apiCalls: ${JSON.stringify(api.apiCalls)}`)),
//                 ),
//             )),
//           TE.map((_) => _.result),
//         ),
//     ),
//   )
// }
