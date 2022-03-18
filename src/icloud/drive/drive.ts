import { sequenceS } from 'fp-ts/lib/Apply'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { NormalizedPath } from '../../cli/cli-drive/cli-drive-actions/helpers'
import { err } from '../../lib/errors'
import { logReturnS } from '../../lib/logging'
import { NEA } from '../../lib/types'
import { AuthorizedState } from '../authorization/authorize'
import * as T from '../drive/drive-requests/types/types'
import { rootDrivewsid, trashDrivewsid } from '../drive/drive-requests/types/types-io'
import * as API from './api/api-methods'
import { Dep } from './api/type'
import * as C from './cache/cache'
import { GetByPathResult, PathValidation, target } from './cache/cache-get-by-path-types'
import { CacheEntityFolderRootDetails, CacheEntityFolderTrashDetails } from './cache/cache-types'
import { ItemIsNotFolderError, NotFoundError } from './errors'
import { getMissedFound } from './helpers'
import { getByPaths, getByPathsH } from './methods/get-by-paths'
import { getFoldersTrees } from './methods/get-folders-trees'
import { searchGlobs } from './methods/search-globs'
import { modifySubset } from './modify-subset'
import { Hierarchy } from './path-validation'

export type DetailsOrFile<R> = (R | T.NonRootDetails | T.DriveChildrenItemFile)

export type DriveMEnv = Dep<'retrieveItemDetailsInFolders'>

export type State = {
  cache: C.Cache
} & AuthorizedState

export type DriveM<A, S extends State = State> = SRTE.StateReaderTaskEither<S, DriveMEnv, Error, A>

const { map, chain, of, filterOrElse } = SRTE

export const ado = sequenceS(SRTE.Apply)

export const readEnv = sequenceS(SRTE.Apply)({
  state: SRTE.get<State, DriveMEnv>(),
  env: SRTE.ask<State, DriveMEnv>(),
})

export const readEnvS = <A>(
  f: (e: { state: State; env: DriveMEnv }) => DriveM<A>,
) => pipe(readEnv, chain(f))

export const logS = flow(logReturnS, map)

export const errS = <A>(s: string): DriveM<A> =>
  readEnvS(
    ({ state }) => SRTE.left(err(s)),
  )

const putCache = (cache: C.Cache): DriveM<void> => readEnvS(({ state }) => SRTE.put({ ...state, cache }))

export const asksCache = <A>(f: (cache: C.Cache) => A): DriveM<A> =>
  pipe(readEnv, map(({ state: { cache } }) => f(cache)))

export const chainCache = <A>(f: (cache: C.Cache) => DriveM<A>): DriveM<A> =>
  readEnvS(({ state: { cache } }) => f(cache))

export const modifyCache = (f: (cache: C.Cache) => C.Cache): DriveM<void> =>
  chainCache(flow(f, putCache, map(constVoid)))

export const retrieveItemDetailsInFoldersCached = (drivewsids: string[]): DriveM<T.MaybeNotFound<T.Details>[]> => {
  return pipe(
    chainCache(
      cache => SRTE.fromEither(C.getFolderDetailsByIdsSeparated(drivewsids)(cache)),
    ),
    SRTE.chain(({ missed }) =>
      pipe(
        missed,
        A.matchW(
          () => SRTE.of({ missed: [], found: [] }),
          (missed) => API.retrieveItemDetailsInFoldersS<State>(missed),
        ),
      )
    ),
    SRTE.chain(putFoundMissed),
    SRTE.chainW(() => asksCache(C.getFolderDetailsByIds(drivewsids))),
    SRTE.chainW(e => SRTE.fromEither(e)),
  )
}

const putFoundMissed = ({ found, missed }: {
  found: T.Details[]
  missed: string[]
}) =>
  pipe(
    putDetailss(found),
    chain(() => cacheRemoveByIds(missed)),
  )

const putDetailss = (detailss: T.Details[]): DriveM<void> =>
  chainCache(
    flow(
      C.putDetailss(detailss),
      SRTE.fromEither,
      chain(putCache),
      map(constVoid),
    ),
  )

export const cacheRemoveByIds = (drivewsids: string[]): DriveM<void> => modifyCache(C.removeByIds(drivewsids))

/** retrieve root from cache or from api if it's missing from cache and chain a computation*/
export const chainRoot = <A>(
  f: (root: T.DetailsDocwsRoot) => DriveM<A>,
): DriveM<A> => {
  return pipe(
    retrieveRootAndTrashIfMissing(),
    chain(() => chainCache(cache => SRTE.fromEither(C.getDocwsRootE()(cache)))),
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
        SRTE.fromEither(pipe(
          (trash ? C.getTrashE() : C.getDocwsRootE())(cache),
          E.map((_: CacheEntityFolderTrashDetails | CacheEntityFolderRootDetails) => _.content),
        ))
      )
    ),
  )
}

export const chainCachedTrash = <R>(
  f: (root: T.DetailsTrash) => DriveM<R>,
): DriveM<R> => {
  return pipe(
    retrieveRootAndTrashIfMissing(),
    chain(() => chainCache(cache => SRTE.fromEither(C.getTrashE()(cache)))),
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
    chain(({ details }) =>
      pipe(
        putFoundMissed(getMissedFound(drivewsids, details)),
        chain(() => of(A.map(T.invalidIdToOption)(details))),
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
    SRTE.chain(
      flow(
        O.sequenceArray,
        SRTE.fromOption(() => err(`some of the ids was not found`)),
        SRTE.map(v => v as NEA<T.Details>),
        v => v as DriveM<NEA<T.Details>>,
      ),
    ),
  )
}

export const getByPathFolder = <R extends T.Root>(
  root: R,
  path: NormalizedPath,
): SRTE.StateReaderTaskEither<State, DriveMEnv, Error, R | T.NonRootDetails> =>
  pipe(
    getByPaths(root, [path]),
    map(NA.head),
    filterOrElse(T.isDetailsG, () => ItemIsNotFolderError.create(`${path} is not a folder`)),
  )

export const getByPathsFolders = <R extends T.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
): SRTE.StateReaderTaskEither<State, DriveMEnv, ItemIsNotFolderError, NEA<R | T.NonRootDetails>> =>
  pipe(
    getByPaths(root, paths),
    filterOrElse((items): items is NEA<R | T.NonRootDetails> => A.every(T.isDetailsG)(items), (e) =>
      ItemIsNotFolderError.create(`is not a folder`)),
  )

export const getByPathFolderCached = <R extends T.Root>(path: NormalizedPath) =>
  (root: R): DriveM<T.Details> =>
    chainCache(cache =>
      SRTE.fromEither(pipe(
        C.getByPathH(root, path)(cache),
        E.chain(_ =>
          _.valid
            ? E.of(target(_))
            : E.left(NotFoundError.create(`not found ${path}`))
        ),
        E.filterOrElse(T.isDetails, () => ItemIsNotFolderError.create()),
      ))
    )

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
    c => SRTE.fromEither(C.getByPaths(root, paths)(c)),
  )

export const getRoot = () => chainRoot(of)
export const getTrash = () => chainCachedTrash(of)

export { getByPaths }
export { searchGlobs }
export { getByPathsH }
export { getFoldersTrees }
export { modifySubset }
