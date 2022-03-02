import { sequenceS } from 'fp-ts/lib/Apply'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { constant, constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { identity } from 'io-ts'
import { NormalizedPath } from '../../cli/cli-drive/cli-drive-actions/helpers'
import { err } from '../../lib/errors'
import { logReturnS } from '../../lib/logging'
import { NEA } from '../../lib/types'
import { AuthorizedState } from '../authorization/authorize'
import { AccountLoginResponseBody } from '../authorization/types'
import { ICloudSession } from '../session/session'
import * as API from './api'
import * as NM from './api/methods'
import { Use } from './api/type'
import * as C from './cache/cache'
import { GetByPathResult, PathValidation, target } from './cache/cache-get-by-path-types'
import { CacheEntityDetails, CacheEntityFolderRootDetails, CacheEntityFolderTrashDetails } from './cache/cache-types'
import { getByPaths, getByPathsH } from './drive/get-by-paths'
import { getFoldersTrees } from './drive/get-folders-trees'
import * as ESRTE from './drive/m2'
import { modifySubset } from './drive/modify-subset'
import { searchGlobs } from './drive/search-globs'
import { Hierarchy } from './drive/validation'
import { ItemIsNotFolderError, NotFoundError } from './errors'
import { getMissedFound } from './helpers'
import * as AR from './requests/request'
import * as T from './requests/types/types'
import { rootDrivewsid, trashDrivewsid } from './requests/types/types-io'

export { getByPaths }
export { searchGlobs }
export { getByPathsH }
export { getFoldersTrees }
export { modifySubset }

export type DetailsOrFile<R> = (R | T.NonRootDetails | T.DriveChildrenItemFile)

export type DriveMEnv = {} & Use<'retrieveItemDetailsInFolders'>

export type DriveMState = {
  cache: C.Cache
} & AuthorizedState

export type DriveM<A, S extends DriveMState = DriveMState> = ESRTE.ESRTE<S, DriveMEnv, Error, A>

export const {
  Do,
  chain,
  fromEither,
  fromOption,
  fromTaskEither,
  get,
  left,
  map,
  of,
  fromTaskEitherE,
  filterOrElse,
} = ESRTE.get<DriveMState, DriveMEnv, Error>()

const ado = sequenceS(SRTE.Apply)
// const FolderLikeItemM = A.getMonoid<T.FolderLikeItem>()

export const readEnv = sequenceS(SRTE.Apply)({
  state: get<DriveMState>(),
  env: SRTE.ask<DriveMState, DriveMEnv>(),
})

export const readEnvS = <A>(
  f: (e: { state: DriveMState; env: DriveMEnv }) => DriveM<A>,
) => pipe(readEnv, chain(f))

export const logS = flow(logReturnS, map)

export const errS = <A>(s: string): DriveM<A> =>
  readEnvS(
    ({ state }) => SRTE.left(err(s)),
    // ({ state }) => SRTE.left({ error: err(s), state }),
  )

// const putSession = (session: AuthorizedState): DriveM<void> =>
//   readEnvS(({ state }) => SRTE.put({ ...state, ...session }))

const putCache = (cache: C.Cache): DriveM<void> => readEnvS(({ state }) => SRTE.put({ ...state, cache }))

export const asksCache = <A>(f: (cache: C.Cache) => A): DriveM<A> =>
  pipe(readEnv, map(({ state: { cache } }) => f(cache)))

export const chainCache = <A>(f: (cache: C.Cache) => DriveM<A>): DriveM<A> =>
  readEnvS(({ state: { cache } }) => f(cache))

const putFoundMissed = ({ found, missed }: {
  found: T.Details[]
  missed: string[]
}) =>
  pipe(
    putDetailss(found),
    chain(() => removeByIds(missed)),
  )

const putDetailss = (detailss: T.Details[]): DriveM<void> =>
  chainCache(
    flow(
      C.putDetailss(detailss),
      fromEither,
      chain(putCache),
      map(constVoid),
    ),
  )

export const retrieveItemDetailsInFoldersCached = (drivewsids: string[]): DriveM<T.MaybeNotFound<T.Details>[]> => {
  return pipe(
    chainCache(
      flow(C.getFolderDetailsByIdsSeparated(drivewsids), fromEither),
    ),
    SRTE.chain(({ missed }) =>
      pipe(
        missed,
        A.match(
          () => SRTE.of({ missed: [], found: [] }),
          missed => NM.retrieveItemDetailsInFoldersS(missed),
        ),
      )
    ),
    chain(putFoundMissed),
    chain(() => asksCache(C.getFolderDetailsByIds(drivewsids))),
    chain(fromEither),
  )
}

export const removeByIds = (drivewsids: string[]): DriveM<void> => modifyCache(C.removeByIds(drivewsids))

export const modifyCache = (f: (cache: C.Cache) => C.Cache): DriveM<void> =>
  chainCache(flow(f, putCache, map(constVoid)))

/** retrieve root from cache or from api if it's missing from cache and chain a computation*/
export const chainRoot = <A>(
  f: (root: T.DetailsDocwsRoot) => DriveM<A>,
): DriveM<A> => {
  return pipe(
    retrieveRootAndTrashIfMissing(),
    chain(() => chainCache(flow(C.getDocwsRootE(), fromEither))),
    map(_ => _.content),
    chain(f),
  )
}

// export const getRoot = () => chainRoot(root => of(root))

export const getCachedRoot = (trash: boolean): DriveM<T.DetailsTrash | T.DetailsDocwsRoot> => {
  return pipe(
    retrieveRootAndTrashIfMissing(),
    chain(() =>
      chainCache(cache =>
        pipe(
          (trash ? C.getTrashE() : C.getDocwsRootE())(cache),
          E.map((_: CacheEntityFolderTrashDetails | CacheEntityFolderRootDetails) => _.content),
          fromEither,
        )
      )
    ),
  )
}

export const chainCachedTrash = <R>(
  f: (root: T.DetailsTrash) => DriveM<R>,
): DriveM<R> => {
  return pipe(
    retrieveRootAndTrashIfMissing(),
    chain(() => chainCache(flow(C.getTrashE(), fromEither))),
    map(_ => _.content),
    chain(f),
  )
}

const retrieveRootAndTrashIfMissing = (): DriveM<void> => {
  return pipe(
    retrieveItemDetailsInFoldersCached([rootDrivewsid, trashDrivewsid]),
    map(constVoid),
  )
}

export function retrieveItemDetailsInFoldersSaving<R extends T.Root>(
  drivewsids: [R['drivewsid'], ...T.NonRootDrivewsid[]],
): DriveM<[O.Some<R>, ...O.Option<T.NonRootDetails>[]]>
export function retrieveItemDetailsInFoldersSaving(
  drivewsids: [typeof rootDrivewsid, ...string[]],
): DriveM<[O.Some<T.DetailsDocwsRoot>, ...O.Option<T.Details>[]]>
export function retrieveItemDetailsInFoldersSaving(
  drivewsids: [typeof trashDrivewsid, ...string[]],
): DriveM<[O.Some<T.DetailsTrash>, ...O.Option<T.Details>[]]>
export function retrieveItemDetailsInFoldersSaving<R extends T.Root>(
  drivewsids: [R['drivewsid'], ...string[]],
): DriveM<[O.Some<R>, ...O.Option<T.Details>[]]>
export function retrieveItemDetailsInFoldersSaving(
  drivewsids: NEA<string>,
): DriveM<NEA<O.Option<T.Details>>>
export function retrieveItemDetailsInFoldersSaving(
  drivewsids: NEA<string>,
): DriveM<NEA<O.Option<T.Details>>> {
  return _retrieveItemDetailsInFoldersSaving(drivewsids) as DriveM<NEA<O.Option<T.Details>>>
}

const _retrieveItemDetailsInFoldersSaving = (
  drivewsids: string[],
): DriveM<O.Option<T.Details>[]> =>
  pipe(
    readEnv,
    SRTE.bindW('details', ({ env }) => env.retrieveItemDetailsInFolders({ drivewsids: drivewsids as NEA<string> })),
    SRTE.chain(({ details }) =>
      pipe(
        putFoundMissed(getMissedFound(drivewsids, details)),
        SRTE.chain(() => of(A.map(T.invalidIdToOption)(details))),
      )
    ),
  )

export function retrieveItemDetailsInFoldersSavingE(
  drivewsids: NEA<T.NonRootDrivewsid>,
): DriveM<NEA<T.NonRootDetails>>
export function retrieveItemDetailsInFoldersSavingE(
  drivewsids: NEA<string>,
): DriveM<NEA<T.Details>> {
  return pipe(
    retrieveItemDetailsInFoldersSaving(drivewsids),
    chain(details =>
      pipe(
        O.sequenceArray(details),
        fromOption(() => err(`some of the ids was not found`)),
        SRTE.map(v => v as NEA<T.Details>),
      )
    ),
  )
}

export const getByPathFolder = <R extends T.Root>(
  root: R,
  path: NormalizedPath,
): ESRTE.ESRTE<DriveMState, DriveMEnv, Error, R | T.NonRootDetails> =>
  pipe(
    getByPaths(root, [path]),
    map(NA.head),
    // chain(
    //   // flow(A.lookup(0), fromOption(() => err(`wat`))),
    // ),
    filterOrElse(T.isDetailsG, () => ItemIsNotFolderError.create(`${path} is not a folder`)),
  )

export const getByPathsFolders = <R extends T.Root>(root: R, paths: NEA<NormalizedPath>) =>
  pipe(
    getByPaths(root, paths),
    filterOrElse(A.every(T.isDetailsG), (e) => ItemIsNotFolderError.create(`is not a folder`)),
  )

export const getByPathFolderCached = <R extends T.Root>(path: NormalizedPath) =>
  (root: R): DriveM<T.Details> =>
    chainCache(flow(
      C.getByPathH(root, path),
      E.chain(_ =>
        _.valid
          ? E.of(target(_))
          : E.left(NotFoundError.create(`not found ${path}`))
      ),
      E.filterOrElse(T.isDetails, () => ItemIsNotFolderError.create()),
      fromEither,
    ))

export const getByPathH = <R extends T.Root>(root: R, path: NormalizedPath): DriveM<PathValidation<Hierarchy<R>>> => {
  return pipe(
    getByPathsH(root, [path]),
    map(NA.head),
  )
}

export const getByPathsCached = <R extends T.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
): DriveM<NEA<GetByPathResult<R>>> =>
  chainCache(
    flow(
      C.getByPaths(root, paths),
      fromEither,
    ),
  )

export const getRoot = () => chainRoot(of)
export const getTrash = () => chainCachedTrash(of)
