import { sequenceS } from 'fp-ts/lib/Apply'
import * as A from 'fp-ts/lib/Array'
import { apply, constant, constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as R from 'fp-ts/lib/Reader'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import { Semigroup } from 'fp-ts/lib/Semigroup'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { NormalizedPath } from '../../cli/cli-drive/cli-drive-actions/helpers'
import { err } from '../../lib/errors'
import { cacheLogger, logReturnS } from '../../lib/logging'
import { NEA } from '../../lib/types'
import { ICloudSessionValidated } from '../authorization/authorize'
import * as API from './api-methods'
import * as C from './cache/cache'
import { ItemIsNotFolderError } from './errors'
import { getByPaths, getByPathsE } from './ffdrive/get-by-paths'
import { getMissedFound } from './helpers'
import * as AR from './requests/reader'

import * as T from './requests/types/types'
import { rootDrivewsid, trashDrivewsid } from './requests/types/types-io'

export { getByPathsE }
/*

type Err = {
  error: Error
  state: DriveMState
}

export type DriveM<A> = SRTE.StateReaderTaskEither<DriveMState, DriveMEnv, Err, A>

export const Do = SRTE.of<DriveMState, DriveMEnv, Error, {}>({})

const ado = sequenceS(SRTE.Apply)
const FolderLikeItemM = A.getMonoid<T.FolderLikeItem>()

export const readEnv = sequenceS(SRTE.Apply)({
  state: SRTE.get<DriveMState, DriveMEnv, Err>(),
  env: SRTE.ask<DriveMState, DriveMEnv, Err>(),
})

SRTE.Chain
export const chain = <A, B>(f: (a: A) => DriveM<B>) => SRTE.chain(f)
export const of = <A>(v: A): DriveM<A> => SRTE.of(v)
export const left = <A>(e: Error): DriveM<A> =>
  pipe(
    readEnv,
    chain(({ state }) =>
      SRTE.left({
        error: e,
        state,
      })
    ),
  )
  export const fromOption = (f: () => Error) =>
  <A>(opt: O.Option<A>): DriveM<A> =>
    pipe(
      opt,
      O.fold(() => left(f()), v => of(v)),
    )

export const errS = <A>(s: string): DriveM<A> => left(err(s))

*/
export type DetailsOrFile<R> = (R | T.DetailsRegular | T.DriveChildrenItemFile)

export type DriveMEnv = {} & API.Env & AR.Env

export type DriveMState = {
  cache: C.Cache
  session: ICloudSessionValidated
}

export type DriveM<A> = SRTE.StateReaderTaskEither<DriveMState, DriveMEnv, Error, A>

export const Do = SRTE.of<DriveMState, DriveMEnv, Error, {}>({})

const ado = sequenceS(SRTE.Apply)
const FolderLikeItemM = A.getMonoid<T.FolderLikeItem>()

export const readEnv = sequenceS(SRTE.Apply)({
  state: SRTE.get<DriveMState, DriveMEnv, Error>(),
  env: SRTE.ask<DriveMState, DriveMEnv, Error>(),
})

SRTE.Chain
export const chain = <A, B>(f: (a: A) => DriveM<B>) => SRTE.chain(f)
export const of = <A>(v: A): DriveM<A> => SRTE.of(v)
export const left = <A>(e: Error): DriveM<A> => SRTE.left(e)
export const fromTaskEither = <A>(te: TE.TaskEither<Error, A>): DriveM<A> => SRTE.fromTaskEither(te)

export const fromApiRequest = <A>(ma: API.Api<A>): DriveM<A> =>
  pipe(
    readEnv,
    chain(({ env, state }) =>
      pipe(
        ma(env)(state.session)(env),
        fromTaskEither,
        chain(([res, session]) =>
          pipe(
            SRTE.put({ ...state, session }),
            map(constant(res)),
          )
        ),
      )
    ),
  )

export const fromOption = (f: () => Error) => <A>(opt: O.Option<A>): DriveM<A> => SRTE.fromOption(f)(opt)

export const errS = <A>(s: string): DriveM<A> => SRTE.left(err(s))

export const map = SRTE.map

export const logS = flow(logReturnS, SRTE.map)

export const lsdir = <R extends T.Root>(root: R, path: NormalizedPath) =>
  pipe(
    getByPathsE(root, [path]),
    chain(
      flow(A.lookup(0), fromOption(() => err(`wat`))),
    ),
    SRTE.filterOrElse(T.isDetails, () => ItemIsNotFolderError.create(`${path} is not a folder`)),
  )

export const retrieveItemDetailsInFolders = (drivewsids: string[]): DriveM<T.MaybeNotFound<T.Details>[]> => {
  return pipe(
    readEnv,
    SRTE.bind('task', ({ state: { cache } }) =>
      SRTE.fromEither(pipe(
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
    SRTE.chain(putFoundMissed),
    SRTE.chain(() =>
      pipe(
        readEnv,
        SRTE.chain(({ state: { cache } }) =>
          SRTE.fromEither(pipe(
            C.getFolderDetailsByIds(drivewsids)(cache),
          ))
        ),
      )
    ),
  )
}

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

const putFoundMissed = ({ found, missed }: {
  found: T.Details[]
  missed: string[]
}) =>
  pipe(
    putDetailss(found),
    SRTE.chain(() => removeByIds(missed)),
  )

export const putDetailss = (detailss: T.Details[]): DriveM<void> =>
  pipe(
    readEnv,
    SRTE.chainW(({ state }) =>
      pipe(
        C.putDetailss(detailss)(state.cache),
        SRTE.fromEither,
        SRTE.chain(cache => SRTE.put({ ...state, cache })),
        SRTE.map(constVoid),
        // SRTE.map(() => detailss),
      )
    ),
  )

export const removeByIds = (drivewsids: string[]): DriveM<void> =>
  pipe(
    readEnv,
    SRTE.chainW(({ state }) =>
      pipe(
        SRTE.put({ ...state, cache: C.removeByIds(drivewsids)(state.cache) }),
        SRTE.map(constVoid),
        // SRTE.map(() => detailss),
      )
    ),
  )

export const chainRoot = <R>(
  f: (root: T.DetailsRoot) => DriveM<R>,
): DriveM<R> => {
  return pipe(
    retrieveRootAndTrashIfMissing(),
    SRTE.chain(() =>
      pipe(
        readEnv,
        chain(({ state: { cache } }) => SRTE.fromEither(C.getRoot()(cache))),
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
    SRTE.chain(() =>
      pipe(
        readEnv,
        chain(({ state: { cache } }) => SRTE.fromEither(C.getTrashE()(cache))),
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
  () =>
    pipe(
      readEnv,
      SRTE.chain(({ state: { cache } }) => SRTE.fromTaskEither(C.trySaveFile(cache, cacheFile))),
    )

export const saveCacheFirst = <T>(cacheFile: string) =>
  (df: DriveM<T>): DriveM<T> =>
    pipe(
      df,
      chain(v =>
        pipe(
          readEnv,
          logS(() => `saving cache`, cacheLogger.debug),
          SRTE.chain(({ state: { cache } }) => SRTE.fromTaskEither(C.trySaveFile(cache, cacheFile))),
          SRTE.chain(() => of(v)),
        )
      ),
    )
