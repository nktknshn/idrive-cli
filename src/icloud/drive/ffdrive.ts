import { sequenceS } from 'fp-ts/lib/Apply'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { filterOrElse as filterOrElse_ } from 'fp-ts/lib/FromEither'
import { apply, constant, constVoid, flow, identity, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import { Predicate } from 'fp-ts/lib/Predicate'
import * as R from 'fp-ts/lib/Reader'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import { Refinement } from 'fp-ts/lib/Refinement'
import { Semigroup } from 'fp-ts/lib/Semigroup'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { NormalizedPath } from '../../cli/cli-drive/cli-drive-actions/helpers'
import { err } from '../../lib/errors'
import { cacheLogger, logReturnS } from '../../lib/logging'
import { NEA } from '../../lib/types'
import { ICloudSessionValidated } from '../authorization/authorize'
import * as API from './api'
import * as C from './cache/cache'
import { HierarchyResult, PathValidation, target } from './cache/cache-get-by-path-types'
import { ItemIsNotFolderError, NotFoundError } from './errors'
import { getByPaths, getByPathsE } from './ffdrive/get-by-paths'
import { Hierarchy } from './ffdrive/validation'
import { getMissedFound } from './helpers'
import * as AR from './requests/request'

import * as ESRTE from './ffdrive/m2'

import { AccountLoginResponseBody } from '../authorization/types'
import { ICloudSession } from '../session/session'
import {
  CacheEntityDetails,
  CacheEntityFolderLike,
  CacheEntityFolderRootDetails,
  CacheEntityFolderTrashDetails,
} from './cache/cache-types'
import * as T from './requests/types/types'
import { rootDrivewsid, trashDrivewsid } from './requests/types/types-io'

export { getByPathsE }

export type DetailsOrFile<R> = (R | T.NonRootDetails | T.DriveChildrenItemFile)

export type DriveMEnv = {} & API.ApiEnv & AR.Env

export type DriveMState = {
  cache: C.Cache
  // session: ICloudSessionValidated
  session: ICloudSession
  accountData: AccountLoginResponseBody
}

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

export type DriveM<A> = ESRTE.ESRTE<DriveMState, DriveMEnv, Error, A>

const ado = sequenceS(SRTE.Apply)
// const FolderLikeItemM = A.getMonoid<T.FolderLikeItem>()

export const readEnv = sequenceS(SRTE.Apply)({
  state: get(),
  env: SRTE.ask<DriveMState, DriveMEnv>(),
})

export const readEnvS = <A>(
  f: (e: { state: DriveMState; env: DriveMEnv }) => DriveM<A>,
) => pipe(readEnv, chain(f))

export const logS = flow(logReturnS, SRTE.map)

export const errS = <A>(s: string): DriveM<A> =>
  readEnvS(
    ({ state }) => SRTE.left(err(s)),
    // ({ state }) => SRTE.left({ error: err(s), state }),
  )

const executeApiRequest = <A>(ma: API.Api<A>) =>
  readEnvS(({ env, state }) =>
    pipe(
      ma(env)(state)(env),
      fromTaskEither,
      // fromTaskEither(({ error, state }) => left(error)),
    )
  )

export const fromApiRequest = <A>(ma: API.Api<A>): DriveM<A> =>
  pipe(
    executeApiRequest(ma),
    chain(([res, session]) =>
      pipe(
        putSession(session),
        map(constant(res)),
      )
    ),
  )

const putSession = (session: ICloudSessionValidated): DriveM<void> =>
  readEnvS(({ state }) => SRTE.put({ ...state, ...session }))

const putCache = (cache: C.Cache): DriveM<void> =>
  readEnvS(
    ({ state }) => SRTE.put({ ...state, cache }),
  )

export const retrieveItemDetailsInFoldersCached = (drivewsids: string[]): DriveM<T.MaybeNotFound<T.Details>[]> => {
  return pipe(
    readEnv,
    SRTE.bind('task', ({ state: { cache } }) =>
      fromEither(pipe(
        C.getFolderDetailsByIdsSeparated(drivewsids)(cache),
      ))),
    SRTE.chain(({ task: { missed } }) =>
      pipe(
        fromApiRequest(
          missed.length > 0
            ? API.retrieveItemDetailsInFoldersS(missed)
            : API.of({ missed: [], found: [] }),
        ),
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

export const saveCache = (cacheFile: string) =>
  () => readEnvS(({ state: { cache } }) => fromTaskEither(C.trySaveFile(cache)(cacheFile)))

export const saveCacheFirst = <T>(cacheFile: string) =>
  (df: DriveM<T>): DriveM<T> =>
    pipe(
      df,
      chain(v =>
        pipe(
          readEnv,
          logS(() => `saving cache`, cacheLogger.debug),
          chain(({ state: { cache } }) => fromTaskEither(C.trySaveFile(cache)(cacheFile))),
          chain(() => of(v)),
        )
      ),
    )

export function retrieveItemDetailsInFoldersSavingNEA<R extends T.Root>(
  drivewsids: [R['drivewsid'], ...T.NonRootDrivewsid[]],
): DriveM<[O.Some<R>, ...O.Option<T.NonRootDetails>[]]>
export function retrieveItemDetailsInFoldersSavingNEA(
  drivewsids: [typeof rootDrivewsid, ...string[]],
): DriveM<[O.Some<T.DetailsDocwsRoot>, ...O.Option<T.Details>[]]>
export function retrieveItemDetailsInFoldersSavingNEA(
  drivewsids: [typeof trashDrivewsid, ...string[]],
): DriveM<[O.Some<T.DetailsTrash>, ...O.Option<T.Details>[]]>
export function retrieveItemDetailsInFoldersSavingNEA<R extends T.Root>(
  drivewsids: [R['drivewsid'], ...string[]],
): DriveM<[O.Some<R>, ...O.Option<T.Details>[]]>
export function retrieveItemDetailsInFoldersSavingNEA(
  drivewsids: NEA<string>,
): DriveM<NEA<O.Option<T.Details>>>
export function retrieveItemDetailsInFoldersSavingNEA(
  drivewsids: NEA<string>,
): DriveM<NEA<O.Option<T.Details>>> {
  return retrieveItemDetailsInFoldersSaving(drivewsids) as DriveM<NEA<O.Option<T.Details>>>
}

export const retrieveItemDetailsInFoldersSaving = (
  drivewsids: string[],
): DriveM<O.Option<T.Details>[]> =>
  pipe(
    readEnv,
    SRTE.bind('details', () =>
      pipe(
        fromApiRequest(
          API.retrieveItemDetailsInFolders({ drivewsids }),
        ),
      )),
    SRTE.chain(({ details }) =>
      pipe(
        putFoundMissed(getMissedFound(drivewsids, details)),
        SRTE.chain(() => of(A.map(T.invalidIdToOption)(details))),
      )
    ),
  )

export const retrieveItemDetailsInFoldersSavingE = (
  drivewsids: NEA<string>,
): DriveM<NEA<T.Details>> =>
  pipe(
    retrieveItemDetailsInFoldersSavingNEA(drivewsids),
    chain(details =>
      pipe(
        O.sequenceArray(details),
        fromOption(() => err(`some of the ids was not found`)),
        SRTE.map(v => v as NEA<T.Details>),
      )
    ),
  )

export const lsdir = <R extends T.Root>(root: R, path: NormalizedPath) =>
  pipe(
    getByPathsE(root, [path]),
    chain(
      flow(A.lookup(0), fromOption(() => err(`wat`))),
    ),
    filterOrElse(T.isDetails, () => ItemIsNotFolderError.create(`${path} is not a folder`)),
  )

export const lsdirCached = <R extends T.Root>(path: NormalizedPath) =>
  (root: R): DriveM<T.Details> =>
    readEnvS(
      ({ state }) =>
        pipe(
          state.cache,
          C.getByPathH(root, path),
          E.chain(_ =>
            _.valid
              ? E.of(target(_))
              : E.left(NotFoundError.create(`not found ${path}`))
          ),
          E.filterOrElse(T.isDetails, () => ItemIsNotFolderError.create()),
          // E.chain(item =>
          //   pipe(
          //     C.getByIdE(item.drivewsid)(state.cache),
          //   )
          // ),
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
    getByPaths(root, [path]),
    map(NA.head),
  )
}

export const lssPartial = <R extends T.Root>(root: R, paths: NEA<NormalizedPath>) => {
  return getByPaths(root, paths)
}

export { getByPaths }

export const getByPathsCached = <R extends T.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
): DriveM<NEA<HierarchyResult<R>>> =>
  pipe(
    readEnvS(({ state }) =>
      pipe(
        C.getByPaths(root, paths)(state.cache),
        fromEither,
      )
    ),
  )
