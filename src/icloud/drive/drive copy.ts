import { sequenceS } from 'fp-ts/lib/Apply'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { constant, constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { NormalizedPath } from '../../cli/cli-drive/cli-drive-actions/helpers'
import { err } from '../../lib/errors'
import { cacheLogger, logReturnS } from '../../lib/logging'
import { NEA } from '../../lib/types'
import { isObjectWithOwnProperty } from '../../lib/util'
import { ICloudSessionValidated } from '../authorization/authorize'
import { AccountLoginResponseBody } from '../authorization/types'
import { ICloudSession } from '../session/session'
import * as API from './api'
import * as C from './cache/cache'
import { GetByPathResult, PathValidation, target } from './cache/cache-get-by-path-types'
import { CacheEntityDetails, CacheEntityFolderRootDetails, CacheEntityFolderTrashDetails } from './cache/cache-types'
import { getByPaths, getByPathsH } from './drive/get-by-paths copy'
import { getFoldersTrees } from './drive/get-folders-trees'
import * as ESRTE from './drive/m2'
import { searchGlobs } from './drive/search-globs'
import { Hierarchy } from './drive/validation'
import { ItemIsNotFolderError, NotFoundError } from './errors'
import { getMissedFound } from './helpers'
import * as RQ from './requests'
import * as AR from './requests/request'
import * as T from './requests/types/types'
import { rootDrivewsid, trashDrivewsid } from './requests/types/types-io'

export { getByPaths }
export { searchGlobs }
export { getByPathsH }
export { getFoldersTrees }
export type DetailsOrFile<R> = (R | T.NonRootDetails | T.DriveChildrenItemFile)

export type ApiType = {
  retrieveItemDetailsInFoldersS: (
    drivewsids: string[],
  ) => AR.ApiRequest<{ missed: string[]; found: (T.Details)[] }, DriveMState>

  retrieveItemDetailsInFolders: (a_0: {
    drivewsids: string[]
  }) => AR.ApiRequest<(T.Details | T.InvalidId)[], DriveMState>
}

export type DriveMEnv =
  & { api: ApiType }
  & API.ApiEnv
  & AR.Env

export type DriveMState = {
  cache: C.Cache
  session: ICloudSession
  accountData: AccountLoginResponseBody
}

export const { Do, chain, fromEither, fromOption, fromTaskEither, get, left, map, of, fromTaskEitherE, filterOrElse } =
  ESRTE.get<DriveMState, DriveMEnv, Error>()

export type DriveM<A> = ESRTE.ESRTE<DriveMState, DriveMEnv, Error, A>

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

const putCache = (cache: C.Cache): DriveM<void> =>
  readEnvS(
    ({ state }) => SRTE.put({ ...state, cache }),
  )

export const retrieveItemDetailsInFoldersCached = (drivewsids: string[]): DriveM<T.MaybeNotFound<T.Details>[]> => {
  return pipe(
    readEnv,
    SRTE.bindW('task', ({ state: { cache } }) =>
      fromEither(pipe(
        C.getFolderDetailsByIdsSeparated(drivewsids)(cache),
      ))),
    SRTE.chainW(({ task: { missed }, env }) =>
      pipe(
        missed.length > 0
          ? env.api.retrieveItemDetailsInFoldersS(missed)
          : SRTE.of<DriveMState, unknown, Error, {
            missed: string[]
            found: (T.Details)[]
          }>({ missed: [], found: [] }),
      )
    ),
    chain(putFoundMissed),
    chain(() =>
      readEnvS(({ state: { cache } }) =>
        fromEither(pipe(
          C.getFolderDetailsByIds(drivewsids)(cache),
        ))
      )
    ),
  )
}

const putFoundMissed = ({ found, missed }: {
  found: T.Details[]
  missed: string[]
}) =>
  pipe(
    putDetailss(found),
    chain(() => removeByIds(missed)),
  )

export const putDetailss = (detailss: T.Details[]): DriveM<void> =>
  readEnvS(({ state }) =>
    pipe(
      C.putDetailss(detailss)(state.cache),
      fromEither,
      chain(putCache),
      map(constVoid),
    )
  )

export const removeByIds = (drivewsids: string[]): DriveM<void> =>
  readEnvS(({ state }) =>
    pipe(
      putCache(C.removeByIds(drivewsids)(state.cache)),
      map(constVoid),
    )
  )

/** retrieve root from cache or from api if it's missing from cache and chain a computation*/
export const chainRoot = <R>(
  f: (root: T.DetailsDocwsRoot) => DriveM<R>,
): DriveM<R> => {
  return pipe(
    retrieveRootAndTrashIfMissing(),
    chain(() =>
      pipe(
        readEnvS(({ state: { cache } }) => fromEither(C.getDocwsRootE()(cache))),
        map(_ => _.content),
        chain(f),
      )
    ),
  )
}

export const getCachedRoot = (trash: boolean): DriveM<T.DetailsTrash | T.DetailsDocwsRoot> => {
  return pipe(
    retrieveRootAndTrashIfMissing(),
    chain(() =>
      readEnvS(({ state: { cache } }) =>
        pipe(
          trash
            ? C.getTrashE()(cache)
            : C.getDocwsRootE()(cache),
          E.map((_: CacheEntityFolderTrashDetails | CacheEntityFolderRootDetails) => _.content),
          fromEither,
          // map(_ => _.content),
        )
      )
    ),
  )
}

export const chainTrash = <R>(
  f: (root: T.DetailsTrash) => DriveM<R>,
): DriveM<R> => {
  return pipe(
    retrieveRootAndTrashIfMissing(),
    chain(() =>
      pipe(
        readEnvS(({ state: { cache } }) => fromEither(C.getTrashE()(cache))),
        map(_ => _.content),
        chain(f),
      )
    ),
  )
}

export const retrieveRootAndTrashIfMissing = (): DriveM<void> => {
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
    SRTE.bindW('details', ({ env }) =>
      pipe(
        env.api.retrieveItemDetailsInFolders({ drivewsids }),
      )),
    SRTE.chain(({ details }) =>
      pipe(
        putFoundMissed(getMissedFound(drivewsids, details)),
        SRTE.chain(() => of(A.map(T.invalidIdToOption)(details))),
      )
    ),
  )

const __retrieveItemDetailsInFoldersSaving = (
  drivewsids: string[],
) =>
  (state: DriveMState) =>
    pipe(
      readEnv,
      SRTE.bindW('details', ({ env }) =>
        pipe(
          env.api.retrieveItemDetailsInFolders({ drivewsids }),
        )),
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

export const lsdir = <R extends T.Root>(root: R, path: NormalizedPath) =>
  pipe(
    getByPaths(root, [path]),
    map(NA.head),
    filterOrElse(T.isDetailsG, () => ItemIsNotFolderError.create(`${path} is not a folder`)),
  )

export const lsdirCached = <R extends T.Root>(path: NormalizedPath) =>
  (root: R): DriveM<T.Details> =>
    readEnvS(
      ({ state }) =>
        pipe(
          C.getByPathH(root, path)(state.cache),
          E.chain(_ =>
            _.valid
              ? E.of(target(_))
              : E.left(NotFoundError.create(`not found ${path}`))
          ),
          E.filterOrElse(T.isDetails, () => ItemIsNotFolderError.create()),
          fromEither,
        ),
    )

export const lsdirCachedO = <R extends T.Root>(path: NormalizedPath) =>
  (root: R) =>
    readEnvS(
      ({ state }) =>
        pipe(
          state.cache,
          C.getByPathH(root, path),
          E.map(_ =>
            _.valid
              ? O.of(target(_))
              : O.none
          ),
          E.filterOrElse(
            (v): v is O.Option<R | T.DetailsFolder | T.DetailsAppLibrary> =>
              O.isNone(v) || (O.isSome(v) && T.isDetails(v.value)),
            () => ItemIsNotFolderError.create(),
          ),
          E.map(flow(
            O.map(item => C.getByIdE(item.drivewsid)(state.cache)),
            O.fold(() => O.none, E.fold(() => O.none, v => O.some(v as CacheEntityDetails))),
          )),
          fromEither,
        ),
    )
export const lsPartial = <R extends T.Root>(root: R, path: NormalizedPath): DriveM<PathValidation<Hierarchy<R>>> => {
  return pipe(
    getByPathsH(root, [path]),
    map(NA.head),
  )
}

export const lssPartial = <R extends T.Root>(root: R, paths: NEA<NormalizedPath>) => {
  return getByPathsH(root, paths)
}

export const getByPathsCached = <R extends T.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
): DriveM<NEA<GetByPathResult<R>>> =>
  pipe(
    readEnvS(({ state }) =>
      pipe(
        C.getByPaths(root, paths)(state.cache),
        fromEither,
      )
    ),
  )
