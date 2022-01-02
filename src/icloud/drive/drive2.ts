import { sequenceS } from 'fp-ts/lib/Apply'
import { constant, constVoid, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { FetchClientEither } from '../../lib/http/fetch-client'
import { ICloudSessionValidated } from '../authorization/authorize'

import { AccountLoginResponseBody } from '../authorization/types'
import { ICloudSession } from '../session/session'
import * as C from './cache/cache'
import * as T from './requests/types/types'

type ApiState = { session: ICloudSessionValidated }
type ApiEnv = {
  client: FetchClientEither
  getCode: () => TE.TaskEither<Error, string>
}

type ApiM<T> = SRTE.StateReaderTaskEither<ApiState, ApiEnv, Error, T>

type DriveState = {
  cache: C.Cache
  session: ICloudSessionValidated
}

type DriveEnv = {}

type Drive<T> = SRTE.StateReaderTaskEither<DriveState, DriveEnv, Error, T>

const readEnvDrive = sequenceS(SRTE.Apply)({
  state: SRTE.get<DriveState, DriveEnv, Error>(),
  env: SRTE.ask<DriveState, DriveEnv, Error>(),
  // api: SRTE.gets<DriveState, DriveEnv, Error>(_ => _.session),
})

const fromTaskEither = <A>(te: TE.TaskEither<Error, A>): Drive<A> => SRTE.fromTaskEither(te)

// export const retrieveItemDetailsInFolders = (drivewsids: string[]): Drive<T.MaybeNotFound<T.Details>[]> => {
//   return pipe(
//     readEnvDrive,
//     SRTE.bind('task', ({ state: { cache } }) =>
//       SRTE.fromEither(pipe(
//         C.getFolderDetailsByIdsSeparated(drivewsids)(cache),
//       ))),
//     SRTE.chain(({ env, task: { missed }, state }) =>
//       pipe(
//         fromTaskEither(
//           missed.length > 0
//             ? env.api.retrieveItemDetailsInFoldersS(missed)
//             : TE.of({ missed: [], found: [] }),
//         ),
//       )
//     ),
//     SRTE.chain(putFoundMissed),
//     SRTE.chain(() =>
//       pipe(
//         readEnv,
//         SRTE.chain(({ state: { cache } }) =>
//           SRTE.fromEither(pipe(
//             C.getFolderDetailsByIds(drivewsids)(cache),
//           ))
//         ),
//       )
//     ),
//   )
// }
