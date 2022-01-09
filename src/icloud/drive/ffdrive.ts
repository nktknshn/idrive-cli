import { sequenceS } from 'fp-ts/lib/Apply'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { filterOrElse as filterOrElse_ } from 'fp-ts/lib/FromEither'
import { apply, constant, constVoid, flow, pipe } from 'fp-ts/lib/function'
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
import { Result } from './cache/cache-get-by-path-types'
import { ItemIsNotFolderError } from './errors'
import { getByPaths, getByPathsE } from './ffdrive/get-by-paths'
import { Hierarchy } from './ffdrive/validation'
import { getMissedFound } from './helpers'
import * as AR from './requests/reader'

import * as T from './requests/types/types'
import { rootDrivewsid, trashDrivewsid } from './requests/types/types-io'

export { getByPathsE }

export type DetailsOrFile<R> = (R | T.DetailsRegular | T.DriveChildrenItemFile)

export type DriveMEnv = {} & API.ApiEnv & AR.Env

export type DriveMState = {
  cache: C.Cache
  session: ICloudSessionValidated
}

type Err = {
  error: Error
  state: DriveMState
}

export type DriveM<A> = SRTE.StateReaderTaskEither<DriveMState, DriveMEnv, Err, A>

export const Do = SRTE.of<DriveMState, DriveMEnv, Err, {}>({})

const ado = sequenceS(SRTE.Apply)
const FolderLikeItemM = A.getMonoid<T.FolderLikeItem>()

export const readEnv = sequenceS(SRTE.Apply)({
  state: SRTE.get<DriveMState, DriveMEnv, Err>(),
  env: SRTE.ask<DriveMState, DriveMEnv, Err>(),
})

export const readEnvS = <A>(
  f: (e: {
    state: DriveMState
    env: DriveMEnv
  }) => DriveM<A>,
) => pipe(readEnv, chain(f))

export const chain = <A, B>(f: (a: A) => DriveM<B>) => SRTE.chain(f)
export const of = <A>(v: A): DriveM<A> => SRTE.of(v)
export const left = <A = never>(e: Error): DriveM<A> => readEnvS(({ state }) => SRTE.left({ error: e, state }))

export const logS = flow(logReturnS, SRTE.map)

export const fromTaskEither = <A>(te: TE.TaskEither<Error, A>): DriveM<A> =>
  (state: DriveMState) =>
    (env: DriveMEnv) =>
      pipe(
        te,
        TE.bimap(
          error => ({ error, state }),
          v => [v, state],
        ),
      )

const executeApiRequest = <A>(ma: API.Api<A>) =>
  readEnvS(({ env, state }) => fromTaskEither(ma(env)(state.session)(env)))

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
  readEnvS(({ state }) => SRTE.put({ ...state, session }))

export const fromOption = (f: () => Error) => <A>(opt: O.Option<A>): DriveM<A> => pipe(opt, O.fold(() => left(f()), of))

export const fromEither = <A>(e: E.Either<Error, A>): DriveM<A> => pipe(e, E.match(e => left(e), a => of(a)))

export const errS = <A>(s: string): DriveM<A> => readEnvS(({ state }) => SRTE.left({ error: err(s), state }))

export const map = SRTE.map

export const retrieveItemDetailsInFolders = (drivewsids: string[]): DriveM<T.MaybeNotFound<T.Details>[]> => {
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
      chain(cache => SRTE.put({ ...state, cache })),
      map(constVoid),
    )
  )

export const removeByIds = (drivewsids: string[]): DriveM<void> =>
  readEnvS(({ state }) =>
    pipe(
      SRTE.put({ ...state, cache: C.removeByIds(drivewsids)(state.cache) }),
      map(constVoid),
    )
  )

export const chainRoot = <R>(
  f: (root: T.DetailsRoot) => DriveM<R>,
): DriveM<R> => {
  return pipe(
    retrieveRootAndTrashIfMissing(),
    chain(() =>
      pipe(
        readEnvS(({ state: { cache } }) => fromEither(C.getRoot()(cache))),
        map(_ => _.content),
        chain(f),
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
  return pipe(retrieveItemDetailsInFolders([rootDrivewsid, trashDrivewsid]), map(constVoid))
}

export const saveCache = (cacheFile: string) =>
  () => readEnvS(({ state: { cache } }) => fromTaskEither(C.trySaveFile(cache, cacheFile)))

export const saveCacheFirst = <T>(cacheFile: string) =>
  (df: DriveM<T>): DriveM<T> =>
    pipe(
      df,
      chain(v =>
        pipe(
          readEnv,
          logS(() => `saving cache`, cacheLogger.debug),
          chain(({ state: { cache } }) => fromTaskEither(C.trySaveFile(cache, cacheFile))),
          chain(() => of(v)),
        )
      ),
    )

export function retrieveItemDetailsInFoldersSavingNEA<R extends T.Root>(
  drivewsids: [R['drivewsid'], ...T.NonRootDrivewsid[]],
): DriveM<[O.Some<R>, ...O.Option<T.DetailsRegular>[]]>
export function retrieveItemDetailsInFoldersSavingNEA(
  drivewsids: [typeof rootDrivewsid, ...string[]],
): DriveM<[O.Some<T.DetailsRoot>, ...O.Option<T.Details>[]]>
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

export const lsPartial = <R extends T.Root>(root: R, path: NormalizedPath): DriveM<Result<Hierarchy<R>>> => {
  return pipe(
    getByPaths(root, [path]),
    map(NA.head),
  )
}

export const lssPartial = <R extends T.Root>(root: R, paths: NEA<NormalizedPath>) => {
  return getByPaths(root, paths)
}

const ap = <A>(fa: DriveM<A>) =>
  <B>(fab: DriveM<(a: A) => B>): DriveM<B> =>
    pipe(
      fab,
      chain(f => pipe(fa, map(a => f(a)))),
    )

export function filterOrElse<A, B extends A>(
  refinement: Refinement<A, B>,
  onFalse: (a: A) => Error,
): (ma: DriveM<A>) => DriveM<B>
export function filterOrElse<A>(
  predicate: Predicate<A>,
  onFalse: (a: A) => Error,
): (ma: DriveM<A>) => DriveM<A>
export function filterOrElse<A>(
  predicate: Predicate<A>,
  onFalse: (a: A) => Error,
): (ma: DriveM<A>) => DriveM<A> {
  return flow(chain(a => predicate(a) ? of(a) : left(onFalse(a))))
}
