import * as A from 'fp-ts/Array'
import { sequenceS } from 'fp-ts/lib/Apply'
import { flow, identity, pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Reader'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { not } from 'fp-ts/lib/Refinement'
import * as TR from 'fp-ts/lib/Tree'
import { mapFst, snd } from 'fp-ts/lib/Tuple'
import * as NA from 'fp-ts/NonEmptyArray'
import * as TE from 'fp-ts/TaskEither'
import { normalizePath } from '../cli/cli-drive/cli-drive-actions/helpers'
import { defaultCacheFile, defaultSessionFile } from '../config'
import { defaultApiEnv } from '../defaults'
import {
  authorizeSessionM,
  authorizeSessionM2,
  authorizeSessionRTE,
  authorizeStateM3,
  ICloudSessionValidated,
} from '../icloud/authorization/authorize'
import { AccountLoginResponseBody } from '../icloud/authorization/types'
import { readAccountData, saveAccountData } from '../icloud/authorization/validate'
import * as API from '../icloud/drive/api'
import * as C from '../icloud/drive/cache/cache'
import * as DF from '../icloud/drive/drive'
import { getMissedFound } from '../icloud/drive/helpers'
import * as RQ from '../icloud/drive/requests'
import * as AR from '../icloud/drive/requests/request'
import {
  Details,
  fileName,
  isFolderLikeItem,
  isInvalidId,
  isNotRootDetails,
} from '../icloud/drive/requests/types/types'
import { rootDrivewsid } from '../icloud/drive/requests/types/types-io'
import * as S from '../icloud/session/session'
import { readSessionFile, saveSession2 } from '../icloud/session/session-file'
import { err, InvalidGlobalSessionError } from '../lib/errors'
import { apiLogger, authLogger, cacheLogger, initLoggers, logger, logReturnAs, stderrLogger } from '../lib/logging'

const retryingF = <
  R extends AR.Env,
  A,
  S extends { session: S.ICloudSession },
  Args extends unknown[],
>(
  f: (...args: Args) => (s: S) => RTE.ReaderTaskEither<R, Error, [A, S]>,
) =>
  (...args: Args) =>
    (s: S): RTE.ReaderTaskEither<R, Error, [A, S]> => {
      return pipe(
        f(...args)(s),
        RTE.orElse(
          (e) =>
            InvalidGlobalSessionError.is(e)
              ? pipe(
                authorizeStateM3(s),
                RTE.chain(f(...args)),
              )
              : RTE.left(e),
        ),
      )
    }

initLoggers(
  { debug: true },
  [logger, cacheLogger, stderrLogger, apiLogger, authLogger],
)

const session = {
  session: S.session('user', 'passw'),
  someData: 1,
}

const ado = sequenceS(RTE.ApplySeq)
import * as O from 'fp-ts/Option'

export const _loadAccountData = (deps: { sessionFile: string }) =>
  pipe(
    readAccountData(`${deps.sessionFile}-accountData`),
    // TE.foldW(() => TE.of(undefined), a => TE.of(a)),
    // TE.fold(() => TE.of(O.none), a => TE.of(O.some(a))),
  )

export const loadAccountDataO = (deps: { sessionFile: string }) =>
  pipe(
    readAccountData(`${deps.sessionFile}-accountData`),
    // TE.foldW(() => TE.of(undefined), a => TE.of(a)),
    TE.fold((e) => TE.of(O.none), a => TE.of(O.some(a))),
  )

import * as E from 'fp-ts/Either'
export const loadAccountDataE = (deps: { sessionFile: string }) =>
  pipe(
    readAccountData(`${deps.sessionFile}-accountData`),
    TE.fold(
      (e) => async () => E.right(E.left(e)),
      (v) => async () => E.right(E.right(v)),
    ),
    // TE.foldW(() => TE.of(undefined), a => TE.of(a)),
    // TE.fold((e) => TE.of(O.none), a => TE.of(O.some(a))),
  )

export const loadOrCreateCache = (deps: { noCache: boolean; cacheFile: string }): TE.TaskEither<Error, CacheF> =>
  pipe(
    deps.noCache
      ? TE.of(C.cachef())
      : C.tryReadFromFile(deps.cacheFile),
    TE.orElseW(
      (e) => pipe(e, logReturnAs('error'), () => TE.of(C.cachef())),
    ),
  )

export const saveSession = <S extends { session: S.ICloudSession }>(state: S) =>
  (deps: { sessionFile: string }) => saveSession2(state.session)(deps.sessionFile)

export const saveAccountData2 = <S extends { accountData: AccountLoginResponseBody }>(
  state: S,
) => (deps: { sessionFile: string }) => saveAccountData(state.accountData, `${deps.sessionFile}-accountData`)

export const loadSessionFile = (deps: { sessionFile: string }) => readSessionFile(deps.sessionFile)

export const loadSessionFileO = (deps: { sessionFile: string }) =>
  pipe(
    readSessionFile(deps.sessionFile),
    TE.fold(() => TE.of(O.none), a => TE.of(O.some(a))),
  )

const saveState = <A>(
  res: [A, {
    session: S.ICloudSession
    accountData: AccountLoginResponseBody
    // cache: CacheF
  }],
) =>
  pipe(
    RTE.of(res),
    RTE.chainFirstW(flow(snd, saveAccountData2)),
    RTE.chainFirstW(flow(snd, saveSession)),
    // RTE.chainFirstW(flow(snd, saveCache)),
  )

import prompts_, { PromptObject } from 'prompts'
import { saveCache } from '../cli/cli-action'
import { autocomplete } from '../cli/cli-drive/cli-drive-actions'
import { CacheF } from '../icloud/drive/cache/cache-types'

const prompts = TE.tryCatchK(prompts_, (e) => err(`error: ${e}`))

const askFile = (deps: { sessionFile: string }) =>
  prompts({
    type: 'text',
    name: 'filename',
    message: 'which file to save session to?',
    initial: deps.sessionFile,
  }, {
    onCancel: () => process.exit(1),
  })

const askUsername = () =>
  prompts({
    type: 'text',
    name: 'username',
    message: 'ICloud username',
  }, {
    onCancel: () => process.exit(1),
  })

const askPassword = () =>
  prompts({
    type: 'password',
    name: 'password',
    message: 'ICloud password',
  }, {
    onCancel: () => process.exit(1),
  })
import { state } from 'fp-ts'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { NEA } from '../lib/types'

const initSessionPrompts = () => {
  return pipe(
    RTE.Do,
    // RTE.ask<{ sessionFile: string }>(),
    RTE.bindW('file', () => askFile),
    RTE.bindW('username', () => askUsername),
    RTE.bindW('password', () => askPassword),
    // RTE.chainW(({ file, username, password }) =>
    // pipe(
    // RTE.of(S.session(username.username, password.password)),
    // RTE.local(() => ({ sessionFile: file.filename })),
    // )
    // ),
  )
}

// const loadSession = () => {
//   return pipe(
//     loadSessionFile,
//     RTE.orElse((e) =>
//       pipe(
//         initSessionPrompts(),
//         RTE.map(
//           ({ username, password, file }) => S.session(username.username, password.password),
//         ),
//       )
//     ),
//     RTE.chainW((session) =>
//       pipe(
//         flow(loadAccountData, TE.map(accountData => ({ accountData, session }))),
//         RTE.orElseW((e) => authorizeStateM3({ session })),
//       )
//     ),
//     RTE.chainFirstW(({ session }) => saveSession({ session })),
//     RTE.chainFirstW(({ accountData }) => saveAccountData2({ accountData })),
//   )
// }

const loadSession = pipe(
  loadSessionFile,
  RTE.orElse(
    (e) =>
      ({ sessionFile }) =>
        TE.left(
          err(
            `${e}: couldn't read session file from '${sessionFile}'. Init new session file by using command\nidrive init -s ${sessionFile}`,
          ),
        ),
  ),
)

const loadAccountData = (
  session: S.ICloudSession,
) =>
  pipe(
    _loadAccountData,
    RTE.map(accountData => ({ session, accountData })),
    RTE.orElseW(e =>
      pipe(
        () => {
          logger.error(`error ${e.name} while reading account data.`)
        },
        RTE.fromIO,
        RTE.chain(() => authorizeStateM3({ session })),
      )
    ),
  )

const loadAuthorization = pipe(
  loadSession,
  RTE.chainW(loadAccountData),
)
const action = pipe(
  DF.getRoot(),
  DF.chain(root => API.retrieveItemDetailsInFoldersS([rootDrivewsid])),
)

const getTrees = (
  drivewsids: NEA<string>,
): AR.ApiRequest<TR.Tree<Details>[], ICloudSessionValidated, API.ApiEnv & AR.Env> => {
  return pipe(
    API.retrieveItemDetailsInFolders({ drivewsids }),
    SRTE.map(flow(A.filter(not(isInvalidId)))),
    SRTE.bindTo('parents'),
    SRTE.bind(
      'subtrees',
      ({ parents }) =>
        pipe(
          parents,
          A.map(_ => A.filter(isFolderLikeItem)(_.items)),
          A.flatten,
          A.match(
            () => SRTE.of([]),
            flow(NA.map(_ => _.drivewsid), getTrees),
          ),
        ),
    ),
    SRTE.map(({ subtrees, parents }) =>
      pipe(
        parents,
        A.map(parent =>
          pipe(
            subtrees,
            A.filter(st => isNotRootDetails(st.value) && st.value.parentId == parent.drivewsid),
          )
        ),
        A.zip(parents),
        A.map(([forest, parent]) => TR.make(parent, forest)),
      )
    ),
  )
}

const recursiveTree = pipe(
  getTrees([rootDrivewsid]),
  SRTE.map(A.map(flow(
    TR.map(fileName),
    TR.drawTree,
  ))),
  SRTE.map(_ => _.join('\n')),
)

const req2 = pipe(
  loadAuthorization,
  RTE.bindW('cache', () => loadOrCreateCache),
  RTE.apS('someth', RTE.of(1)),
  RTE.chainW(recursiveTree),
  RTE.chainFirstW(res =>
    pipe(
      RTE.of(snd(res)),
      RTE.chainFirstW(saveAccountData2),
      RTE.chainFirstW(saveSession),
      // RTE.chainFirstW(saveCache),
    )
  ),
  RTE.fold(
    (e) => () => async () => `${e.message}`,
    ([res, state]) => () => async () => res,
  ),
)

const main = async () => {
  const t = req2({
    sessionFile: defaultSessionFile,
    cacheFile: defaultCacheFile,
    noCache: false,
    // api,
    ...defaultApiEnv,
  })

  console.log(
    await t(),
  )
}

main()

// const req1 = pipe(
//   // loadSession(),
//   RTE.Do,
//   RTE.bindW('session', () => loadSessionFile),
//   RTE.bindW('accountData', () => loadAccountData),
//   // RTE.bindW('cache', () => loadCache),
//   RTE.chainW(
//     // API.retrieveTrashDetails(),
//     RQ.retrieveItemDetailsInFolders({ drivewsids: [rootDrivewsid] }),
//     // DF.chainRoot(root => DF.lsdir(root, normalizePath('/'))),
//   ),
//   RTE.chainW(
//     ([res, state]) =>
//       pipe(
//         state,
//         RQ.retrieveItemDetailsInFolders({ drivewsids: [rootDrivewsid] }),
//       ),
//   ),
//   RTE.chainW(flow(snd, RQ.retrieveItemDetailsInFolders({ drivewsids: [rootDrivewsid] }))),
//   RTE.chainW(
//     ([res, state]) => pipe(state, API.retrieveItemDetailsInFolders({ drivewsids: [rootDrivewsid] })),
//   ),
//   RTE.chainW(
//     ([res, state]) => pipe(state, autocomplete({ path: '/', trash: false, file: false, dir: true, cached: false })),
//   ),
//   RTE.chainFirstW(saveState),
//   RTE.fold(
//     (e) => RTE.left(err(`error ${e}`)),
//     v => RTE.of(JSON.stringify(v)),
//   ),
// )

const retrieveItemDetailsInFolders = retryingF(RQ.retrieveItemDetailsInFolders)
const retrieveItemDetailsInFoldersS = retryingF(
  <S extends ICloudSessionValidated, R extends AR.Env>(drivewsids: string[]) =>
    pipe(
      RQ.retrieveItemDetailsInFolders<S, R>({ drivewsids }),
      AR.map(ds => getMissedFound(drivewsids, ds)),
    ),
)

// const api: DF.ApiType = {
//   retrieveItemDetailsInFolders,
//   retrieveItemDetailsInFoldersS,
// }

type CommonOperator<S extends { session: S.ICloudSession }, A, R> = (s: S) => RTE.ReaderTaskEither<R, Error, A>
