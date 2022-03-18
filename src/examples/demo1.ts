import * as A from 'fp-ts/Array'
import * as E from 'fp-ts/Either'
import { sequenceS } from 'fp-ts/lib/Apply'
import { flow, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { not } from 'fp-ts/lib/Refinement'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TR from 'fp-ts/lib/Tree'
import { snd } from 'fp-ts/lib/Tuple'
import * as NA from 'fp-ts/NonEmptyArray'
import * as O from 'fp-ts/Option'
import * as TE from 'fp-ts/TaskEither'
import prompts_ from 'prompts'
import { saveCache } from '../cli/cli-action'
import { defaultCacheFile, defaultSessionFile } from '../config'
import { defaultApiEnv } from '../defaults'
import { AuthorizedState, AuthorizeEnv, authorizeStateM3 } from '../icloud/authorization/authorize'
import { AccountLoginResponseBody } from '../icloud/authorization/types'
import { readAccountData, saveAccountData } from '../icloud/authorization/validate'
import * as API from '../icloud/drive/api'
import * as NM from '../icloud/drive/api/methods'
import { executor } from '../icloud/drive/api/newbuilder'
import * as NR from '../icloud/drive/api/requests'
import * as NT from '../icloud/drive/api/type'
import * as C from '../icloud/drive/cache/cache'
import { CacheF } from '../icloud/drive/cache/cache-types'
import * as AR from '../icloud/drive/requests/request'
import * as T from '../icloud/drive/requests/types/types'
import { rootDrivewsid } from '../icloud/drive/requests/types/types-io'
import * as S from '../icloud/session/session'
import { readSessionFile, saveSession2 } from '../icloud/session/session-file'
import { err } from '../lib/errors'
import { apiLogger, authLogger, cacheLogger, initLoggers, logger, logReturnAs, stderrLogger } from '../lib/logging'
import { NEA, RT, XXX } from '../lib/types'

initLoggers(
  { debug: true },
  [logger, cacheLogger, stderrLogger, apiLogger, authLogger],
)

const ado = sequenceS(RTE.ApplySeq)

export const _loadAccountData = (deps: { sessionFile: string }) =>
  pipe(
    readAccountData(`${deps.sessionFile}-accountData`),
  )

export const loadAccountDataO = (deps: { sessionFile: string }) =>
  pipe(
    readAccountData(`${deps.sessionFile}-accountData`),
    TE.fold((e) => TE.of(O.none), a => TE.of(O.some(a))),
  )

export const loadAccountDataE = (deps: { sessionFile: string }) =>
  pipe(
    readAccountData(`${deps.sessionFile}-accountData`),
    TE.fold(
      (e) => async () => E.right(E.left(e)),
      (v) => async () => E.right(E.right(v)),
    ),
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
): RT<
  AR.RequestEnv & AuthorizeEnv & { sessionFile: string },
  Error,
  { session: S.ICloudSession; accountData: AccountLoginResponseBody }
> =>
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

const getAuthorizedState: RTE.ReaderTaskEither<
  { sessionFile: string } & API.ApiEnv & AR.RequestEnv & AuthorizeEnv,
  Error,
  AuthorizedState
> = pipe(
  loadSession,
  RTE.chain(loadAccountData),
)

type TreeNode = T.Details | T.DriveChildrenItemFile
type Deps = NT.Use<'retrieveItemDetailsInFolders'>

const getTrees = <S extends AuthorizedState & { someth: number }>(
  drivewsids: NEA<string>,
): XXX<S, Deps, TR.Tree<TreeNode>[]> => {
  const getSubfolders = (parents: T.Details[]): T.FolderLikeItem[] =>
    A.flatten(
      parents.map(
        _ => A.filter(T.isFolderLikeItem)(_.items),
      ),
    )

  const matchSubtrees = (
    parents: T.Details[],
    subtrees: TR.Tree<TreeNode>[],
  ): [TR.Tree<TreeNode>[], T.Details][] =>
    pipe(
      parents.map(p =>
        subtrees.filter(
          st =>
            T.isNotRootDetails(st.value)
            && st.value.parentId == p.drivewsid,
        )
      ),
      A.zip(parents),
    )

  const makeTree = (parent: T.Details, subtrees: TR.Tree<TreeNode>[]) =>
    TR.make(
      parent,
      pipe(
        parent.items,
        A.filter(T.isFileItem),
        A.map(TR.make),
        A.concat(subtrees),
      ),
    )

  return pipe(
    SRTE.ask<S, Deps>(),
    SRTE.chainW(_ => _.retrieveItemDetailsInFolders({ drivewsids })),
    SRTE.map(A.filter(not(T.isInvalidId))),
    SRTE.bindTo('parents'),
    SRTE.bind('subtrees', ({ parents }) =>
      pipe(
        getSubfolders(parents),
        A.match(
          () => SRTE.of([]),
          sfs => getTrees<S>(pipe(sfs, NA.map(_ => _.drivewsid))),
        ),
      )),
    SRTE.map(({ subtrees, parents }) => matchSubtrees(parents, subtrees)),
    SRTE.map(A.map(([subtrees, parent]) => makeTree(parent, subtrees))),
  )
}

const prog2 = <S extends AuthorizedState>() =>
  pipe(
    NM.retrieveItemDetailsInFoldersS<S>([rootDrivewsid]),
    SRTE.map(_ => _.missed.join(',')),
  )

const rootTreeProgram = <S extends AuthorizedState & { someth: number }>() =>
  pipe(
    getTrees<S>([rootDrivewsid]),
    SRTE.map(A.map(flow(
      TR.map(T.fileNameAddSlash),
      TR.drawTree,
    ))),
    SRTE.map(_ => _.join('\n')),
  )

const program = pipe(
  getAuthorizedState,
  RTE.bindW('cache', () => loadOrCreateCache),
  RTE.apS('someth', RTE.of(1)),
  RTE.chainW(pipe(rootTreeProgram())),
  RTE.chainFirstW(res =>
    pipe(
      RTE.of(snd(res)),
      RTE.chainFirstW(saveAccountData2),
      RTE.chainFirstW(saveSession),
      RTE.chainFirstW(saveCache),
    )
  ),
  RTE.match(
    (e) => `${e.name}: ${e.message}`,
    ([res]) => res,
  ),
)
const ex = executor(defaultApiEnv)

const api = {
  retrieveItemDetailsInFolders: ex(NR.getFoldersRequest),
  downloadM: ex(NR.downloadM),
}

const main = async () => {
  const t = program({
    sessionFile: defaultSessionFile,
    cacheFile: defaultCacheFile,
    noCache: false,
    ...defaultApiEnv,
    ...api,
  })

  console.log(
    await t(),
  )
}

main()
