import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { err } from '../../lib/errors'
import { loggerIO } from '../../lib/loggerIO'
import { logReturnS } from '../../lib/logging'
import { NormalizedPath } from '../../lib/normalize-path'
import { NEA } from '../../lib/types'
import * as C from './cache/cache'
import { GetByPathResult, pathTarget } from './cache/cache-get-by-path-types'
import { CacheEntityFolderRootDetails, CacheEntityFolderTrashDetails, CacheF } from './cache/cache-types'
import { DepApi } from './deps'
import * as API from './deps/api-methods'
import { getByPaths, getByPathsStrict } from './drive-methods/drive-get-by-paths'
import { getFoldersTrees } from './drive-methods/drive-get-folders-trees'
import { searchGlobs } from './drive-methods/drive-search-globs'
import { ItemIsNotFolderError, NotFoundError } from './errors'
import { getMissedFound as createMissedFound } from './helpers'
import { modifySubset } from './modify-subset'
import { AuthorizedState } from './requests/request'
import * as T from './types'
import { rootDrivewsid, trashDrivewsid } from './types/types-io'
export { getByPathsStrict }
export { searchGlobs }
export { getByPaths }
export { getFoldersTrees }
export { modifySubset }

const { map, chain, of, filterOrElse } = SRTE

export type Deps = DepApi<'retrieveItemDetailsInFolders'>

export type State = { cache: C.Cache } & AuthorizedState

export type Effect<A, R = Deps> = SRTE.StateReaderTaskEither<State, R, Error, A>
export type Action<R, A> = SRTE.StateReaderTaskEither<State, R, Error, A>

// export type DriveEffect<R, A> = SRTE.StateReaderTaskEither<State, R, Error, A>

const state = () => SRTE.get<State, Deps>()
const env = () => SRTE.ask<State, Deps>()

export const logS = flow(logReturnS, SRTE.map)

export const errS = <A>(s: string): Effect<A> => SRTE.left(err(s))

export const removeByIdsFromCache = (drivewsids: string[]): Effect<void> => modifyCache(C.removeByIds(drivewsids))

/** retrieve root from cache or from api if it's missing from cache and chain a computation*/
export const chainCachedDocwsRoot = <A>(
  f: (root: T.DetailsDocwsRoot) => Effect<A>,
): Effect<A> => {
  return pipe(
    retrieveRootAndTrashIfMissing(),
    chain(() => chainCache(cache => SRTE.fromEither(C.getDocwsRoot(cache)))),
    map(_ => _.content),
    chain(f),
  )
}

export const getCachedRoot = (trash: boolean): Effect<T.Root> => {
  return pipe(
    retrieveRootAndTrashIfMissing(),
    chain(() =>
      chainCache(cache =>
        SRTE.fromEither(pipe(
          (trash ? C.getTrash : C.getDocwsRoot)(cache),
          E.map((_: CacheEntityFolderTrashDetails | CacheEntityFolderRootDetails) => _.content),
        ))
      )
    ),
  )
}

export const chainCachedTrash = <A>(
  f: (root: T.DetailsTrash) => Effect<A>,
): Effect<A> => {
  return pipe(
    retrieveRootAndTrashIfMissing(),
    chain(() => chainCache(SRTE.fromEitherK(C.getTrash))),
    map(_ => _.content),
    chain(f),
  )
}

const retrieveRootAndTrashIfMissing = (): Effect<void> => {
  return pipe(
    retrieveItemDetailsInFoldersCached([rootDrivewsid, trashDrivewsid]),
    map(constVoid),
  )
}

/** returns details from cache if they are there otherwise fetches them from icloid api.   */
const retrieveItemDetailsInFoldersCached = (drivewsids: string[]): Effect<T.MaybeInvalidId<T.Details>[]> => {
  return pipe(
    chainCache(
      SRTE.fromEitherK(C.getFoldersDetailsByIdsSeparated(drivewsids)),
    ),
    SRTE.chain(({ missed }) =>
      pipe(
        missed,
        A.matchW(
          () => SRTE.of({ missed: [], found: [] }),
          (missed) => API.retrieveItemDetailsInFoldersSeparated<State>(missed),
        ),
      )
    ),
    SRTE.chain(putMissedFound),
    SRTE.chainW(() => asksCache(C.getFoldersDetailsByIds(drivewsids))),
    SRTE.chainW(e => SRTE.fromEither(e)),
  )
}

/** retrieves actual drivewsids saving valid ones to cache and removing those that were not found */
export function retrieveItemDetailsInFoldersSaving<R extends T.Root>(
  drivewsids: [R['drivewsid'], ...T.NonRootDrivewsid[]],
): Effect<[O.Some<R>, ...O.Option<T.NonRootDetails>[]]>
export function retrieveItemDetailsInFoldersSaving(
  drivewsids: [typeof rootDrivewsid, ...string[]],
): Effect<[O.Some<T.DetailsDocwsRoot>, ...O.Option<T.Details>[]]>
export function retrieveItemDetailsInFoldersSaving(
  drivewsids: [typeof trashDrivewsid, ...string[]],
): Effect<[O.Some<T.DetailsTrash>, ...O.Option<T.Details>[]]>
export function retrieveItemDetailsInFoldersSaving<R extends T.Root>(
  drivewsids: [R['drivewsid'], ...string[]],
): Effect<[O.Some<R>, ...O.Option<T.Details>[]]>
export function retrieveItemDetailsInFoldersSaving(
  drivewsids: NEA<string>,
): Effect<NEA<O.Option<T.Details>>>
export function retrieveItemDetailsInFoldersSaving(
  drivewsids: NEA<string>,
): Effect<NEA<O.Option<T.Details>>> {
  return pipe(
    API.retrieveItemDetailsInFolders<State>({ drivewsids }),
    chain((details) =>
      pipe(
        createMissedFound(drivewsids, details),
        putMissedFound,
        chain(() => of(NA.map(T.invalidIdToOption)(details))),
      )
    ),
  )
}

/** fails if some of the ids were not found */
export function retrieveItemDetailsInFoldersSavingStrict(
  drivewsids: NEA<T.NonRootDrivewsid>,
): Effect<NEA<T.NonRootDetails>>
export function retrieveItemDetailsInFoldersSavingStrict(
  drivewsids: NEA<string>,
): Effect<NEA<T.Details>> {
  return pipe(
    retrieveItemDetailsInFoldersSaving(drivewsids),
    SRTE.chain(
      flow(
        O.sequenceArray,
        SRTE.fromOption(() => err(`some of the ids was not found`)),
        v => v as Effect<NEA<T.Details>>,
      ),
    ),
  )
}

export const getByPathFolder = <R extends T.Root>(
  root: R,
  path: NormalizedPath,
): Effect<R | T.NonRootDetails> =>
  pipe(
    getByPathsStrict(root, [path]),
    map(NA.head),
    filterOrElse(
      T.isDetailsG,
      () => ItemIsNotFolderError.create(`${path} is not a folder`),
    ),
  )

export const getByPathsFolders = <R extends T.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
): Effect<NEA<R | T.NonRootDetails>> =>
  pipe(
    getByPathsStrict(root, paths),
    filterOrElse(
      (items): items is NEA<R | T.NonRootDetails> => A.every(T.isDetailsG)(items),
      (e) => ItemIsNotFolderError.create(`some of the paths are not folders`),
    ),
  )

export const getByPathFolderFromCache = <R extends T.Root>(path: NormalizedPath) =>
  (root: R): Effect<T.Details> =>
    chainCache(cache =>
      SRTE.fromEither(pipe(
        C.getByPath(root, path)(cache),
        _ =>
          _.valid
            ? E.of(pathTarget(_))
            : E.left(NotFoundError.create(`not found ${path}`)),
        E.filterOrElse(T.isDetails, () => ItemIsNotFolderError.create()),
      ))
    )

export const getByPath = <R extends T.Root>(root: R, path: NormalizedPath): Effect<GetByPathResult<R>> => {
  return pipe(
    getByPaths(root, [path]),
    map(NA.head),
  )
}

export const getByPathsFromCache = <R extends T.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
): Effect<NEA<GetByPathResult<R>>> =>
  asksCache(
    C.getByPaths(root, paths),
  )

export const getDocwsRoot = () => chainCachedDocwsRoot(of)
export const getTrash = () => chainCachedTrash(of)

const putCache = (cache: C.Cache): Effect<void> =>
  pipe(
    state(),
    SRTE.chain(
      (state: State) => SRTE.put({ ...state, cache }),
    ),
  )

const putDetailss = (detailss: T.Details[]): Effect<void> =>
  chainCache(
    flow(
      C.putDetailss(detailss),
      SRTE.fromEither,
      SRTE.chain(putCache),
    ),
  )

const putMissedFound = ({ found, missed }: {
  found: T.Details[]
  missed: string[]
}): Effect<void> =>
  pipe(
    putDetailss(found),
    chain(() => removeByIdsFromCache(missed)),
  )

export const asksCache = <A>(f: (cache: C.Cache) => A): Effect<A> => pipe(state(), map(({ cache }) => f(cache)))

export const chainCache = <A>(f: (cache: C.Cache) => Effect<A>): Effect<A> =>
  pipe(state(), chain(({ cache }) => f(cache)))

const modifyCache = (f: (cache: C.Cache) => C.Cache): Effect<void> => chainCache(flow(f, putCache, map(constVoid)))
