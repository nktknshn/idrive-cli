import assert from 'assert'
import { sequenceS } from 'fp-ts/lib/Apply'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { apply, constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import * as R from 'fp-ts/lib/Record'
import { Semigroup } from 'fp-ts/lib/Semigroup'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { NormalizedPath } from '../../cli/cli-drive/cli-drive-actions/helpers'
import { err } from '../../lib/errors'
import { cacheLogger, logger, logReturnAs, logReturnS } from '../../lib/logging'
import { NEA } from '../../lib/types'
// import { Cache } from './cache/Cache
import * as C from '../drive/cache/cachef'
import { GetByPathResult } from './cache/cachef/GetByPathResultValid'
import { DriveApi } from './drive-api'
import { ItemIsNotFolderError, MissinRootError, NotFoundError } from './errors'
import { lssE, lsss } from './fdrive/lsss'
import { Hierarchy } from './fdrive/validation'
import { getMissedFound, parsePath } from './helpers'
import * as T from './requests/types/types'
import { rootDrivewsid, trashDrivewsid } from './requests/types/types-io'

export { lssE }

export type DetailsOrFile<R> = (R | T.DetailsRegular | T.DriveChildrenItemFile)

export type DriveMEnv = {
  api: DriveApi
}

export type DriveM<A> = SRTE.StateReaderTaskEither<C.Cache, DriveMEnv, Error, A>

export const Do = SRTE.of<C.Cache, DriveMEnv, Error, {}>({})

const ado = sequenceS(SRTE.Apply)
const FolderLikeItemM = A.getMonoid<T.FolderLikeItem>()

export const lssPartial = <R extends T.Root>(root: R, paths: NEA<NormalizedPath>) => {
  return lsss(root, paths)
}

export const lsPartial = <R extends T.Root>(root: R, path: NormalizedPath): DriveM<GetByPathResult<Hierarchy<R>>> => {
  return pipe(
    lsss(root, [path]),
    map(NA.head),
  )
}

export const ls = <R extends T.Root>(root: R, path: NormalizedPath) =>
  pipe(
    lssE(root, [path]),
    chain(
      flow(A.lookup(0), fromOption(() => err(`wat`))),
    ),
  )

export const lsdir = <R extends T.Root>(root: R, path: NormalizedPath) =>
  pipe(
    lssE(root, [path]),
    chain(
      flow(A.lookup(0), fromOption(() => err(`wat`))),
    ),
    SRTE.filterOrElse(T.isDetails, () => ItemIsNotFolderError.create(`${path} is not a folder`)),
  )

export const retrieveRootIfMissing = (): DriveM<void> => {
  return pipe(getRoot(), map(constVoid))
}

export const retrieveRootAndTrashIfMissing = (): DriveM<void> => {
  return pipe(retrieveItemDetailsInFolders([rootDrivewsid, trashDrivewsid]), map(constVoid))
}

export const chainRoot = <R>(
  f: (root: T.DetailsRoot) => DriveM<R>,
): DriveM<R> => {
  return pipe(
    retrieveRootAndTrashIfMissing(),
    SRTE.chain(() =>
      pipe(
        readEnv,
        chain(({ cache }) => SRTE.fromEither(C.getRoot()(cache))),
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
        chain(({ cache }) => SRTE.fromEither(C.getTrashE()(cache))),
        map(_ => _.content),
        chain(f),
      )
    ),
  )
}

export const readEnv = sequenceS(SRTE.Apply)({
  cache: SRTE.get<C.Cache, DriveMEnv>(),
  env: SRTE.ask<C.Cache, DriveMEnv>(),
})

export const chain = <A, B>(f: (a: A) => DriveM<B>) => SRTE.chain(f)
export const of = <A>(v: A): DriveM<A> => SRTE.of(v)
export const left = <A>(e: Error): DriveM<A> => SRTE.left(e)
export const fromTaskEither = <A>(te: TE.TaskEither<Error, A>): DriveM<A> => SRTE.fromTaskEither(te)
export const fromOption = (f: () => Error) => <A>(opt: O.Option<A>): DriveM<A> => SRTE.fromOption(f)(opt)
export const errS = <A>(s: string): DriveM<A> => SRTE.left(err(s))

export const map = SRTE.map

export const logS = flow(logReturnS, SRTE.map)

const putFoundMissed = ({ found, missed }: {
  found: T.Details[]
  missed: string[]
}) =>
  pipe(
    putDetailss(found),
    SRTE.chain(() => removeByIds(missed)),
  )

export const retrieveItemDetailsInFoldersSaving = (
  drivewsids: string[],
): DriveM<O.Option<T.Details>[]> =>
  pipe(
    readEnv,
    SRTE.bind('details', ({ env }) =>
      pipe(
        fromTaskEither(
          env.api.retrieveItemDetailsInFolders(drivewsids),
        ),
      )),
    SRTE.chain(({ details }) =>
      pipe(
        putFoundMissed(getMissedFound(drivewsids, details)),
        SRTE.chain(() => of(A.map(T.asOption)(details))),
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

export const retrieveItemDetailsInFolders = (drivewsids: string[]): DriveM<T.MaybeNotFound<T.Details>[]> => {
  return pipe(
    readEnv,
    SRTE.bind('task', ({ cache }) =>
      SRTE.fromEither(pipe(
        C.getFolderDetailsByIdsSeparated(drivewsids)(cache),
      ))),
    SRTE.chain(({ env, task: { missed } }) =>
      pipe(
        SRTE.fromTaskEither<Error, { found: T.Details[]; missed: string[] }, C.Cache, DriveMEnv>(
          missed.length > 0
            ? env.api.retrieveItemDetailsInFoldersS(missed)
            : TE.of({ missed: [], found: [] }),
        ),
      )
    ),
    SRTE.chain(putFoundMissed),
    SRTE.chain(() =>
      pipe(
        readEnv,
        SRTE.chain(({ cache }) =>
          SRTE.fromEither(pipe(
            C.getFolderDetailsByIds(drivewsids)(cache),
          ))
        ),
      )
    ),
  )
}

export const retrieveItemDetailsInFoldersCachingO = (drivewsids: string[]): DriveM<O.Option<T.Details>[]> => {
  return pipe(
    retrieveItemDetailsInFolders(drivewsids),
    SRTE.map(A.map(T.asOption)),
  )
}

export const retrieveItemDetailsInFoldersCachingE = (drivewsids: string[]): DriveM<T.Details[]> => {
  return pipe(
    retrieveItemDetailsInFoldersCachingO(drivewsids),
    SRTE.map(flow(O.sequenceArray, O.map(RA.toArray))),
    SRTE.chain(v => SRTE.fromOption(() => err(`missing some item`))(v)),
  )
}

export const expectSome = SRTE.chainOptionK(() => err(`invalid response (empty array)`))

export const retrieveItemDetailsInFolder = (drivewsid: string): DriveM<O.Option<T.Details>> =>
  pipe(
    retrieveItemDetailsInFolders([drivewsid]),
    expectSome(A.lookup(0)),
    SRTE.map(T.asOption),
  )

export const retrieveItemDetailsInFolderCachingE = (drivewsid: string): DriveM<T.Details> =>
  pipe(
    retrieveItemDetailsInFolder(drivewsid),
    SRTE.chain(v => SRTE.fromOption(() => NotFoundError.create(`${drivewsid} was not found`))(v)),
  )

const getSubfolders = (folders: T.Details[]) =>
  pipe(
    folders,
    A.map(folder => pipe(folder.items, A.filter(T.isFolderLikeItem))),
    A.reduce(FolderLikeItemM.empty, FolderLikeItemM.concat),
  )

export const getRoot = (): DriveM<T.DetailsRoot> =>
  pipe(
    retrieveItemDetailsInFolder(rootDrivewsid),
    SRTE.filterOrElseW(O.isSome, () => MissinRootError.create(`misticaly missing root details`)),
    SRTE.map(_ => _.value),
    SRTE.filterOrElseW(T.isCloudDocsRootDetails, () => err(`invalid root details`)),
  )

export const getFolderDetailsByIdE = retrieveItemDetailsInFolderCachingE

export const getFolderRecursive = (
  path: string,
  depth: number,
): DriveM<T.RecursiveFolder> =>
  pipe(
    readEnv,
    SRTE.bind('parent', () => getFolderByPath(path)),
    SRTE.chain(({ parent }) => getFoldersRecursively([parent.drivewsid], depth)),
    expectSome(A.lookup(0)),
  )

export const getFolderByPath = (path: string): DriveM<T.Details> =>
  pipe(
    getItemByPath(path),
    SRTE.filterOrElse(
      T.isFolderLike,
      (item) => ItemIsNotFolderError.create(`${path} is not folder details (type=${T.itemType(item)})`),
    ),
    SRTE.chain(ensureDetailsForFolderLike),
  )

export const getFileOrFolderByPath = (
  path: string,
): DriveM<T.Details | T.DriveChildrenItemFile> =>
  pipe(
    getItemByPath(path),
    SRTE.chain(item =>
      T.isFolderLike(item) && !T.isDetails(item)
        ? retrieveItemDetailsInFolderCachingE(item.drivewsid)
        : SRTE.of(item)
    ),
  )

export const ensureDetails = (
  itemOrDetails: T.DriveFolderLike | T.DriveChildrenItemFile,
): DriveM<T.Details | T.DriveChildrenItemFile> =>
  pipe(
    T.isFolderLike(itemOrDetails) && !T.isDetails(itemOrDetails)
      ? retrieveItemDetailsInFolderCachingE(itemOrDetails.drivewsid)
      : SRTE.of(itemOrDetails),
  )

export const ensureDetailsC = chain(ensureDetails)

export const ensureDetailsForFolderLike = (
  itemOrDetails: T.DriveFolderLike,
): DriveM<T.Details> =>
  pipe(
    !T.isDetails(itemOrDetails)
      ? retrieveItemDetailsInFolderCachingE(itemOrDetails.drivewsid)
      : SRTE.of(itemOrDetails),
  )

export const withCache = <T>(initialCache: C.Cache, sg: Semigroup<C.Cache>) =>
  (
    f: () => DriveM<T>,
  ): DriveM<T> =>
    pipe(
      readEnv,
      SRTE.chain(({ cache }) =>
        pipe(
          SRTE.put(initialCache),
          SRTE.chain(f),
          SRTE.chainW(result =>
            pipe(
              SRTE.get<C.Cache, DriveMEnv, Error>(),
              SRTE.chain((c: C.Cache) => SRTE.put(sg.concat(cache, c))),
              SRTE.map(() => result),
            )
          ),
        )
      ),
    )

export const withEmptyCache = <T>(sg: Semigroup<C.Cache>) =>
  (f: () => DriveM<T>): DriveM<T> => withCache<T>(C.cachef(), sg)(f)

/*
class NotFoundErrorWithIndex extends Error {
  constructor(readonly index: number, msg: string) {
    super(msg)
  }

  static is(e: Error): e is NotFoundErrorWithIndex {
    return e instanceof NotFoundErrorWithIndex
  }

  static create(index: number, msg: string): NotFoundErrorWithIndex {
    return new NotFoundErrorWithIndex(index, msg)
  }
}
*/

export const getItemByPathRelativeG = (
  path: string[],
  parent: T.DriveFolderLike,
): DriveM<T.DriveFolderLike | T.DriveChildrenItemFile> => {
  logger.debug(`getItemByPathRelativeG: path=${path} parent=${parent.drivewsid} (${T.fileName(parent)})`)
  return pipe(
    path,
    A.reduceWithIndex(
      of<T.DriveFolderLike | T.DriveChildrenItemFile>(parent),
      (index, parent, itemName) =>
        pipe(
          ado({
            parent: pipe(
              parent,
              SRTE.chain((parent): DriveM<T.Details> =>
                T.isFile(parent)
                  ? SRTE.left(err(`${parent.drivewsid} is not a folder`))
                  : !T.isDetails(parent)
                  ? retrieveItemDetailsInFolderCachingE(parent.drivewsid)
                  : SRTE.of(parent)
              ),
            ),
          }),
          SRTE.bind(
            'item',
            ({ parent }) =>
              SRTE.fromOption(() =>
                NotFoundError.createTemplate(
                  itemName,
                  `"${T.fileName(parent)}" (${parent.drivewsid})`,
                )
              )(
                pipe(
                  parent.items,
                  A.findFirst((item: T.DriveChildrenItem | T.DriveChildrenTrashItem) => itemName == T.fileName(item)),
                ),
              ),
          ),
          SRTE.map(_ => _.item),
        ),
    ),
  )
}

// export const getItemByPathRelativeM = (
//   path: string[],
//   parent: DriveFolderLike,
// ): DriveM<MaybePartial> => {
// }

export const logCache = (msg?: string) =>
  () =>
    pipe(
      readEnv,
      SRTE.map(_ => _.cache),
      SRTE.map(logReturnAs(`${msg ?? ''} cache`)),
    )

export const getItemByPathRelative = (
  path: string[],
  parentId: string,
): DriveM<T.DriveFolderLike | T.DriveChildrenItemFile> => {
  return pipe(
    getFolderDetailsByIdE(parentId),
    SRTE.chain(parent => getItemByPathRelativeG(path, parent)),
  )
}

export const getItemByPath = (path: string): DriveM<T.Details | T.DriveChildrenItem> => {
  const [, ...parsedPath] = parsePath(path)

  return pipe(
    getItemByPathRelative(parsedPath, rootDrivewsid),
  )
}

export const getFoldersRecursively = (drivewsids: string[], depth: number): DriveM<T.RecursiveFolder[]> => {
  return pipe(
    ado({
      folders: retrieveItemDetailsInFoldersCachingE(drivewsids),
    }),
    SRTE.bind('foldersItems', ({ folders }) => SRTE.of(getSubfolders(folders))),
    SRTE.bind('g', ({ foldersItems }) =>
      SRTE.of({
        doGoDeeper: depth > 0 && foldersItems.length > 0,
        emptySubfolders: foldersItems.length == 0 && depth > 0,
        depthExceed: foldersItems.length > 0 && depth == 0,
      })),
    SRTE.chain(({ folders, foldersItems, g: { depthExceed, doGoDeeper } }) =>
      doGoDeeper
        ? pipe(
          getFoldersRecursively(foldersItems.map(_ => _.drivewsid), depth - 1),
          SRTE.map(groupBy(_ => T.isNotRootDetails(_.details) ? _.details.parentId : 'ERROR')),
          SRTE.map(g => zipWithChildren(folders, g)),
          SRTE.map(A.map(([p, c]) => deepFolder(p, c))),
        )
        : depthExceed
        ? SRTE.of(pipe(folders, A.map(shallowFolder)))
        : SRTE.of(pipe(folders, A.map(f => deepFolder(f, []))))
    ),
  )
}

export const putDetailss = (detailss: T.Details[]): DriveM<void> =>
  pipe(
    readEnv,
    SRTE.chainW(({ cache }) =>
      pipe(
        cache,
        C.putDetailss(detailss),
        SRTE.fromEither,
        SRTE.chain(cache => SRTE.put(cache)),
        SRTE.map(constVoid),
        // SRTE.map(() => detailss),
      )
    ),
  )

export const removeByIds = (drivewsids: string[]): DriveM<void> =>
  pipe(
    readEnv,
    SRTE.chainW(({ cache }) =>
      pipe(
        SRTE.put(C.removeByIds(drivewsids)(cache)),
        SRTE.map(constVoid),
        // SRTE.map(() => detailss),
      )
    ),
  )

export const putItems = (detailss: T.DriveChildrenItem[]): DriveM<void> =>
  pipe(
    readEnv,
    SRTE.chainW(({ cache }) =>
      pipe(
        C.putItems(detailss)(cache),
        SRTE.fromEither,
        SRTE.chain(cache => SRTE.put(cache)),
        SRTE.map(constVoid),
        // SRTE.map(() => detailss),
      )
    ),
  )

export const updateFoldersDetails = (
  drivewsids: string[],
): DriveM<(T.MaybeNotFound<T.DriveDetailsWithHierarchy>)[]> => {
  return pipe(
    readEnv,
    SRTE.chainW(({ env, cache }) =>
      pipe(
        env.api.retrieveItemDetailsInFoldersHierarchies(drivewsids),
        SRTE.fromTaskEither,
        SRTE.chain(details =>
          pipe(
            getMissedFound(drivewsids, details),
            ({ missed, found }) =>
              pipe(
                C.removeByIds(missed)(cache),
                C.putDetailss(found),
              ),
            SRTE.fromEither,
            SRTE.chain(cache => SRTE.put(cache)),
            SRTE.map(() => details),
          )
        ),
      )
    ),
  )
}

export const saveCache = (cacheFile: string) =>
  () =>
    pipe(
      readEnv,
      SRTE.chain(({ cache }) => SRTE.fromTaskEither(C.trySaveFile(cache, cacheFile))),
    )

export const saveCacheFirst = <T>(cacheFile: string) =>
  (df: DriveM<T>): DriveM<T> =>
    pipe(
      df,
      chain(v =>
        pipe(
          readEnv,
          logS(() => `saving cache`, cacheLogger.debug),
          SRTE.chain(({ cache }) => SRTE.fromTaskEither(C.trySaveFile(cache, cacheFile))),
          SRTE.chain(() => of(v)),
        )
      ),
    )

const shallowFolder = (details: T.Details): T.RecursiveFolder => ({
  details,
  deep: false,
})

const deepFolder = (details: T.Details, children: T.RecursiveFolder[]): T.RecursiveFolder => ({
  details,
  children,
  deep: true,
})

const groupBy = <T>(f: (item: T) => string): (items: T[]) => Record<string, T[]> =>
  (items: T[]): Record<string, T[]> => {
    let result: Record<string, T[]> = {}

    for (const el of items) {
      result = pipe(
        result,
        R.lookup(f(el)),
        O.getOrElse((): T[] => []),
        children => R.upsertAt(f(el), [...children, el]),
        apply(result),
      )
    }

    return result
  }

const zipWithChildren = (
  folders: T.Details[],
  itemByParentId: Record<string, T.RecursiveFolder[]>,
): (readonly [T.Details, T.RecursiveFolder[]])[] =>
  pipe(
    folders,
    A.map(folder =>
      [
        folder,
        pipe(
          itemByParentId,
          R.lookup(folder.drivewsid),
          O.getOrElseW(() => []),
        ),
      ] as const
    ),
  )
