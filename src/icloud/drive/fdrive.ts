import { string } from 'fp-ts'
import { apS, getApplySemigroup, sequenceS, sequenceT } from 'fp-ts/lib/Apply'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { apply, constant, constVoid, flow, identity, pipe } from 'fp-ts/lib/function'
import { Functor, Functor1, map } from 'fp-ts/lib/Functor'
import { URIS } from 'fp-ts/lib/HKT'
import * as J from 'fp-ts/lib/Json'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import * as ROR from 'fp-ts/lib/ReadonlyRecord'
import { fst } from 'fp-ts/lib/ReadonlyTuple'
import * as R from 'fp-ts/lib/Record'
import { Semigroup } from 'fp-ts/lib/Semigroup'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { snd } from 'fp-ts/lib/Tuple'
import { compareDetails, NormalizedPath } from '../../cli/actions/helpers'
import { err } from '../../lib/errors'
import { cacheLogger, logf, logg, logger, logReturn, logReturnAs } from '../../lib/logging'
import { cast } from '../../lib/util'
import { Cache } from './cache/Cache'
// import * as Cache from './cache/Cache'
import { isFolderLikeCacheEntity, PartialValidPath } from './cache/cachef'
import * as C from './cache/cachef'
import { DriveApi } from './drive-api'
import { fileName, hasName, parsePath, zipIds } from './helpers'
import {
  asOption,
  DriveChildrenItem,
  DriveChildrenItemFile,
  DriveDetails,
  DriveDetailsRoot,
  DriveDetailsWithHierarchy,
  DriveFolderLike,
  DriveItemDetails,
  FolderLikeItem,
  Hierarchy,
  HierarchyEntry,
  InvalidId,
  isFile,
  isFolderDetails,
  isFolderLike,
  isFolderLikeItem,
  isInvalidId,
  isNotInvalidId,
  isNotRootDetails,
  isRootDetails,
  MaybeNotFound,
  RecursiveFolder,
} from './types'

import * as S from 'fp-ts/Semigroup'
import { log } from './drivef/ls'
import { lss } from './drivef/lss'
import { ItemIsNotFolder, MissinRootError, NotFoundError } from './errors'
import { rootDrivewsid } from './types-io'

export { lss }

export const ls = (path: NormalizedPath) =>
  pipe(
    lss([path]),
    chain(
      flow(
        A.lookup(0),
        fromOption(() => err(`wat`)),
      ),
    ),
  )
export const lsdir = (path: NormalizedPath) =>
  pipe(
    lss([path]),
    chain(
      flow(
        A.lookup(0),
        fromOption(() => err(`wat`)),
      ),
    ),
    SRTE.filterOrElse(isFolderDetails, () => ItemIsNotFolder.create(`${path} is not a folder`)),
  )

export type DriveM<A> = SRTE.StateReaderTaskEither<Cache, DriveApi, Error, A>
export const Do = SRTE.of<Cache, DriveApi, Error, {}>({})

// export const log =

const ado = sequenceS(SRTE.Apply)
const FolderLikeItemM = A.getMonoid<FolderLikeItem>()

export const readEnv = sequenceS(SRTE.Apply)({
  cache: SRTE.get<Cache, DriveApi>(),
  api: SRTE.ask<Cache, DriveApi>(),
})

export const chain = <A, B>(f: (a: A) => DriveM<B>) => SRTE.chain(f)
export const of = <A>(v: A): DriveM<A> => SRTE.of(v)
export const fromTaskEither = <A>(te: TE.TaskEither<Error, A>): DriveM<A> => SRTE.fromTaskEither(te)
export const fromOption = (f: () => Error) => <A>(opt: O.Option<A>): DriveM<A> => SRTE.fromOption(f)(opt)

function enumerate<T>(as: T[]) {
  return pipe(
    as,
    A.mapWithIndex((idx, v) => [idx, v] as const),
  )
}

function partitateTask(task: (readonly [string, MaybeNotFound<DriveDetails>])[]) {
  return pipe(
    task,
    A.partitionMapWithIndex((idx, [dwid, result]) =>
      result.status === 'ID_INVALID'
        ? E.left({ idx, dwid })
        : E.right({ idx, dwid, result })
    ),
    ({ left: missed, right: cached }) => ({ missed, cached }),
  )
}

const putFoundMissed = ({ found, missed }: {
  found: DriveDetails[]
  missed: string[]
}) =>
  pipe(
    // logg(`found: ${found.map(_ => _.items.map(fileName))}`),
    putDetailss(found),
    SRTE.chain(() => removeByIds(missed)),
  )

const same = (a: HierarchyEntry, b: HierarchyEntry) => {
  if (a.drivewsid !== b.drivewsid) {
    return false
  }

  if (hasName(a) && hasName(b)) {
    return fileName(a) == fileName(b)
  }

  // if (
  //   !isHierarchyItemTrash(a) && !isHierarchyItemRoot(a)
  //   && !isHierarchyItemTrash(b) && !isHierarchyItemRoot(b)
  // ) {
  //   return fileName(a) == fileName(b)
  // }

  return true
}

export const getValidHierarchyPart = (
  actualDetails: O.Option<DriveDetailsWithHierarchy>[],
  cachedHierarchy: Hierarchy,
): {
  validPart: DriveDetailsWithHierarchy[]
  rest: string[]
} => {
  const presentDetails = pipe(
    actualDetails,
    A.takeLeftWhile(O.isSome),
    A.map(_ => _.value),
  )

  return pipe(
    A.zip(
      C.itemsToHierarchy(presentDetails),
      cachedHierarchy,
    ),
    A.takeLeftWhile(([a, b]) => same(a, b)),
    _ => ({
      validPart: A.takeLeft(_.length)(presentDetails),
      rest: pipe(
        A.dropLeft(_.length)(cachedHierarchy),
        A.map(_ => hasName(_) ? fileName(_) : 'ERROR'),
      ),
    }),
  )
}

export const validateHierarchy = (hierarchy: Hierarchy) => {
  if (hierarchy.length == 0) {
    return of({
      validPart: [],
      rest: [],
    })
  }

  return pipe(
    readEnv,
    SRTE.chain(({ api }) =>
      pipe(
        retrieveItemDetailsInFoldersSaving(
          hierarchy.map(_ => _.drivewsid),
        ),
      )
    ),
    SRTE.map(actuals => getValidHierarchyPart(actuals, hierarchy)),
  )
}

/*
returns
*/
export const validateCachedPath = (
  path: NormalizedPath,
): DriveM<{ validPart: DriveDetailsWithHierarchy[]; rest: string[] }> => {
  return pipe(
    readEnv,
    logf(`validatePath: ${path}`),
    SRTE.bind('cached', ({ cache }) => SRTE.of(cache.getByPathV(path))),
    SRTE.chain(({ cached }) =>
      pipe(
        cached.valid
          ? pipe(
            C.entitiesToHierarchy(cached.entities),
            logReturnAs('cached.entities'),
            validateHierarchy,
          )
          : pipe(
            C.entitiesToHierarchy(cached.validPart),
            logReturnAs('cached part'),
            validateHierarchy,
            SRTE.map(_ => ({
              validPart: _.validPart,
              rest: pipe(
                cached.validPart,
                A.dropLeft(_.validPart.length),
                A.map(_ => fileName(_.content)),
                files => [...files, ...cached.rest],
              ),
            })),
          ),
      )
    ),
  )
}

export const getByPath = (path: NormalizedPath): DriveM<DriveChildrenItemFile | DriveDetails> =>
  pipe(
    logg(`getByPath.`),
    () => validateCachedPath(path),
    SRTE.chain(({ rest, validPart }) =>
      pipe(
        A.isNonEmpty(validPart)
          ? pipe(
            getActualRelative(rest, NA.last(validPart)),
            ensureDetailsC,
          )
          : getActual(path),
      )
    ),
  )

export const getActualFolder = (path: NormalizedPath) =>
  pipe(
    () => pipe(getFolderByPath(path)),
    withEmptyCache(Cache.semigroup),
  )

export const getActual = (path: NormalizedPath) =>
  pipe(
    () => getFileOrFolderByPath(path),
    withEmptyCache(Cache.semigroup),
  )

export const getActualRelative = (rest: string[], parent: DriveFolderLike) =>
  pipe(
    readEnv,
    SRTE.bind('extractedCache', ({ cache }) => SRTE.fromEither(C.extractCacheById(parent.drivewsid)(cache.get()))),
    chain(({ extractedCache }) =>
      pipe(
        () => pipe(getItemByPathRelativeG(rest, parent), ensureDetailsC),
        withCache(Cache.create(extractedCache), Cache.semigroup),
      )
    ),
  )

export const retrieveItemDetailsInFoldersSaving = (
  drivewsids: string[],
): DriveM<O.Option<DriveDetailsWithHierarchy>[]> =>
  pipe(
    readEnv,
    SRTE.bind('details', ({ api }) =>
      pipe(
        fromTaskEither(
          api.retrieveItemDetailsInFoldersHierarchies(drivewsids),
        ),
      )),
    SRTE.chain(({ details }) =>
      pipe(
        putFoundMissed(zipIds(drivewsids, details)),
        SRTE.chain(() => of(A.map(asOption)(details))),
      )
    ),
  )

export const retrieveItemDetailsInFolders = (drivewsids: string[]): DriveM<MaybeNotFound<DriveDetails>[]> => {
  return pipe(
    readEnv,
    SRTE.bind('task', ({ cache }) =>
      SRTE.fromEither(pipe(
        cache.getFolderDetailsByIdsSeparated(drivewsids),
      ))),
    SRTE.chain(({ api, task: { missed } }) =>
      pipe(
        readEnv,
        SRTE.chain(() =>
          pipe(
            SRTE.fromTaskEither<Error, { found: DriveDetails[]; missed: string[] }, Cache, DriveApi>(
              missed.length > 0
                ? api.retrieveItemDetailsInFoldersS(missed)
                : TE.of({ missed: [], found: [] }),
            ),
          )
        ),
      )
    ),
    SRTE.chain(putFoundMissed),
    SRTE.chain(() =>
      pipe(
        readEnv,
        SRTE.chain(({ cache }) =>
          SRTE.fromEither(pipe(
            cache.getFolderDetailsByIds(drivewsids),
          ))
        ),
      )
    ),
  )
}

export const retrieveItemDetailsInFoldersO = (drivewsids: string[]): DriveM<O.Option<DriveDetails>[]> => {
  return pipe(
    retrieveItemDetailsInFolders(drivewsids),
    SRTE.map(A.map(asOption)),
  )
}

export const retrieveItemDetailsInFoldersE = (drivewsids: string[]): DriveM<DriveDetails[]> => {
  return pipe(
    retrieveItemDetailsInFoldersO(drivewsids),
    SRTE.map(flow(O.sequenceArray, O.map(RA.toArray))),
    SRTE.chain(v => SRTE.fromOption(() => err(`missing some item`))(v)),
  )
}

export const retrieveItemDetailsInFoldersOld = (drivewsids: string[]): DriveM<MaybeNotFound<DriveDetails>[]> => {
  // const ordering = pipe(
  //   drivewsids,
  //   A.mapWithIndex((idx, dwid) => [dwid, idx] as const),
  //   R.fromFoldableMap(S.last<number>(), A.FoldableWithIndex),
  // )

  type Z = (readonly [MaybeNotFound<DriveDetails>, string])

  return pipe(
    readEnv,
    SRTE.bind('task', ({ cache }) => SRTE.fromEither(cache.getFolderDetailsByIdsSeparated(drivewsids))),
    // SRTE.map(
    //   logReturn(({ task }) =>
    //     cacheLogger.debug(`${task.missed.length} missed caches (${task.missed}), ${task.cached.length} hits`)
    //   ),
    // ),
    SRTE.chain(({ api, task: { missed, cached } }) =>
      pipe(
        readEnv,
        SRTE.chain(({ cache }) =>
          pipe(
            SRTE.fromTaskEither<Error, Z[], Cache, DriveApi>(
              missed.length > 0
                ? pipe(
                  api.retrieveItemDetailsInFolders(missed),
                  TE.map(A.zip(missed)),
                )
                : TE.of([]),
            ),
            SRTE.chain(details =>
              pipe(
                putDetailss(pipe(
                  details,
                  A.filterMap((
                    [response, drivewsid],
                  ) => isInvalidId(response) ? O.none : O.some(response)),
                )),
                // cache.putDetailss(details),
                // SRTE.fromEither,
                // SRTE.chain(cache => SRTE.put(cache)),
                SRTE.chain(() =>
                  SRTE.of([
                    ...cached.map(_ => _.content),
                    // ...pipe(details, A.map(flow(A.map(fst)), A.filter(isNotInvalidId))),
                  ])
                ),
              )
            ),
          )
        ),
      )
    ),
    // SRTE.chainFirstW(logCache()),
  )
}

export const expectSome = SRTE.chainOptionK(() => err(`invalid response (empty array)`))

export const retrieveItemDetailsInFolder = (drivewsid: string): DriveM<O.Option<DriveDetails>> =>
  pipe(
    retrieveItemDetailsInFolders([drivewsid]),
    expectSome(A.lookup(0)),
    SRTE.map(asOption),
  )

export const retrieveItemDetailsInFolderE = (drivewsid: string): DriveM<DriveDetails> =>
  pipe(
    retrieveItemDetailsInFolder(drivewsid),
    SRTE.chain(v => SRTE.fromOption(() => NotFoundError.create(`${drivewsid} was not found`))(v)),
  )

const getSubfolders = (folders: DriveDetails[]) =>
  pipe(
    folders,
    A.map(folder => pipe(folder.items, A.filter(isFolderLikeItem))),
    A.reduce(FolderLikeItemM.empty, FolderLikeItemM.concat),
  )

export const getRoot = (): DriveM<DriveDetailsRoot> =>
  pipe(
    retrieveItemDetailsInFolder(rootDrivewsid),
    SRTE.filterOrElseW(O.isSome, () => MissinRootError.create(`misticaly missing root details`)),
    SRTE.map(_ => _.value),
    SRTE.filterOrElseW(isRootDetails, () => err(`invalid root details`)),
  )

export const getFolderDetailsById = retrieveItemDetailsInFolder
export const getFolderDetailsByIdE = retrieveItemDetailsInFolderE

export const getFolderRecursive = (
  path: string,
  depth: number,
): DriveM<RecursiveFolder> =>
  pipe(
    readEnv,
    SRTE.bind('parent', () => getFolderByPath(path)),
    SRTE.chain(({ parent }) => getFoldersRecursively([parent.drivewsid], depth)),
    expectSome(A.lookup(0)),
  )

export const getFolderByPath = (path: string): DriveM<DriveDetails> =>
  pipe(
    getItemByPath(path),
    SRTE.filterOrElse(
      isFolderLike,
      (item) => ItemIsNotFolder.create(`${path} is not folder details (type=${item.type})`),
    ),
    SRTE.chain(ensureDetailsForFolderLike),
  )

export const getFileOrFolderByPath = (
  path: string,
): DriveM<DriveDetails | DriveChildrenItemFile> =>
  pipe(
    getItemByPath(path),
    SRTE.chain(item =>
      isFolderLike(item) && !isFolderDetails(item)
        ? retrieveItemDetailsInFolderE(item.drivewsid)
        : SRTE.of(item)
    ),
  )

export const ensureDetails = (
  itemOrDetails: DriveFolderLike | DriveChildrenItemFile,
): DriveM<DriveDetails | DriveChildrenItemFile> =>
  pipe(
    isFolderLike(itemOrDetails) && !isFolderDetails(itemOrDetails)
      ? retrieveItemDetailsInFolderE(itemOrDetails.drivewsid)
      : SRTE.of(itemOrDetails),
  )

export const ensureDetailsC = chain(ensureDetails)

export const ensureDetailsForFolderLike = (
  itemOrDetails: DriveFolderLike,
): DriveM<DriveDetails> =>
  pipe(
    !isFolderDetails(itemOrDetails)
      ? retrieveItemDetailsInFolderE(itemOrDetails.drivewsid)
      : SRTE.of(itemOrDetails),
  )

export const withCache = <T>(initialCache: Cache, sg: Semigroup<Cache>) =>
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
              SRTE.get<Cache, DriveApi, Error>(),
              SRTE.chain((c: Cache) => SRTE.put(sg.concat(cache, c))),
              SRTE.map(() => result),
            )
          ),
        )
      ),
    )

export const withEmptyCache = <T>(sg: Semigroup<Cache>) =>
  (f: () => DriveM<T>): DriveM<T> => withCache<T>(Cache.create(), sg)(f)

export const getItemByPathRelativeG = (
  path: string[],
  parent: DriveFolderLike,
): DriveM<DriveFolderLike | DriveChildrenItemFile> => {
  logger.debug(`getItemByPathRelativeG: path=${path} parent=${parent.drivewsid} (${fileName(parent)})`)
  return pipe(
    path,
    A.reduce(
      SRTE.of<Cache, DriveApi, Error, DriveFolderLike | DriveChildrenItemFile>(parent),
      (parent, itemName) =>
        pipe(
          ado({
            parent: pipe(
              parent,
              SRTE.chain((parent): DriveM<DriveDetails> =>
                isFile(parent)
                  ? SRTE.left(err(`${parent.drivewsid} is not a folder`))
                  : !isFolderDetails(parent)
                  ? retrieveItemDetailsInFolderE(parent.drivewsid)
                  : SRTE.of(parent)
              ),
            ),
          }),
          SRTE.bind('item', ({ parent }) =>
            SRTE.fromOption(() =>
              err(`item "${itemName}" was not found in "${parent.name}" (${parent.drivewsid})`)
            )(
              pipe(parent.items, A.findFirst(item => itemName == fileName(item))),
            )),
          SRTE.map(_ => _.item),
        ),
    ),
  )
}

export const logCache = (msg?: string) =>
  () =>
    pipe(
      readEnv,
      SRTE.map(_ => _.cache.get()),
      SRTE.map(logReturnAs(`${msg ?? ''} cache`)),
    )

export const getItemByPathRelative = (
  path: string[],
  parentId: string,
): DriveM<DriveFolderLike | DriveChildrenItemFile> => {
  return pipe(
    getFolderDetailsByIdE(parentId),
    SRTE.chain(parent => getItemByPathRelativeG(path, parent)),
  )
}

export const getItemByPath = (path: string): DriveM<DriveDetails | DriveChildrenItem> => {
  const [, ...parsedPath] = parsePath(path)

  return pipe(
    getItemByPathRelative(parsedPath, rootDrivewsid),
  )
}

export const getFoldersRecursively = (drivewsids: string[], depth: number): DriveM<RecursiveFolder[]> => {
  return pipe(
    ado({
      folders: retrieveItemDetailsInFoldersE(drivewsids),
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
          SRTE.map(groupBy(_ => isNotRootDetails(_.details) ? _.details.parentId : 'ERROR')),
          SRTE.map(g => zipWithChildren(folders, g)),
          SRTE.map(A.map(([p, c]) => deepFolder(p, c))),
        )
        : depthExceed
        ? SRTE.of(pipe(folders, A.map(shallowFolder)))
        : SRTE.of(pipe(folders, A.map(f => deepFolder(f, []))))
    ),
  )
}

export const updateCacheByIds = (
  drivewsids: string[],
): DriveM<MaybeNotFound<DriveDetailsWithHierarchy>[]> =>
  pipe(
    readEnv,
    SRTE.chain(({ cache }) =>
      pipe(
        cache.getByIds(drivewsids),
        A.filterMap(identity),
        A.map(_ => isFolderLikeCacheEntity(_) ? _.content.drivewsid : _.content.parentId),
        A.uniq(string.Eq),
        updateFoldersDetails,
      )
    ),
  )

export const updateFolderDetailsByPath = (
  path: string,
): DriveM<(DriveDetailsWithHierarchy | InvalidId)> =>
  pipe(
    readEnv,
    SRTE.chainW(({ cache }) =>
      pipe(
        cache.getFolderByPathE(path),
        SRTE.fromEither,
        SRTE.chain(_ => updateFoldersDetails([_.content.drivewsid])),
        expectSome(A.lookup(0)),
      )
    ),
  )

export const putDetailss = (detailss: DriveDetails[]): DriveM<void> =>
  pipe(
    readEnv,
    SRTE.chainW(({ cache }) =>
      pipe(
        cache.putDetailss(detailss),
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
        SRTE.put(cache.removeByIds(drivewsids)),
        SRTE.map(constVoid),
        // SRTE.map(() => detailss),
      )
    ),
  )

export const putItems = (detailss: DriveChildrenItem[]): DriveM<void> =>
  pipe(
    readEnv,
    SRTE.chainW(({ cache }) =>
      pipe(
        cache.putItems(detailss),
        SRTE.fromEither,
        SRTE.chain(cache => SRTE.put(cache)),
        SRTE.map(constVoid),
        // SRTE.map(() => detailss),
      )
    ),
  )

export const updateFoldersDetails = (
  drivewsids: string[],
): DriveM<(MaybeNotFound<DriveDetailsWithHierarchy>)[]> => {
  return pipe(
    readEnv,
    SRTE.chainW(({ api, cache }) =>
      pipe(
        api.retrieveItemDetailsInFoldersHierarchies(drivewsids),
        SRTE.fromTaskEither,
        SRTE.chain(details =>
          pipe(
            zipIds(drivewsids, details),
            ({ missed, found }) =>
              pipe(
                cache.removeByIds(missed),
                _ => _.putDetailss(found),
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

export const updateFoldersDetailsRecursively = (
  drivewsids: string[],
): DriveM<DriveDetailsWithHierarchy[]> => {
  // ): DriveM<MaybeNotFound<DriveDetailsWithHierarchy>[]> => {
  logger.debug('updateFoldersDetailsRecursively')
  return pipe(
    readEnv,
    SRTE.bind('cachedDetails', ({ api, cache }) =>
      SRTE.of(pipe(
        cache.getByIds(drivewsids),
        A.filterMap(O.chain(v => v.hasDetails ? O.some(v) : O.none)),
      ))),
    SRTE.bind('actualDetails', ({ cachedDetails, api, cache }) =>
      SRTE.fromTaskEither(pipe(
        cachedDetails.map(_ => _.content.drivewsid),
        api.retrieveItemDetailsInFoldersHierarchiesE,
      ))),
    SRTE.bindW('result', ({ cachedDetails, actualDetails }) =>
      pipe(
        A.zip(cachedDetails, actualDetails),
        A.map(([cached, actual]) => compareDetails(cached.content, actual)),
        flow(
          A.map(_ => _.updated.folders),
          A.flatten,
          A.map(snd),
          A.map(_ => _.drivewsid),
        ),
        drivewsids =>
          drivewsids.length > 0
            ? pipe(
              updateFoldersDetailsRecursively(drivewsids),
              SRTE.map(A.concat(actualDetails)),
            )
            : SRTE.of(actualDetails),
      )),
    SRTE.chainW(({ actualDetails, result }) =>
      pipe(
        readEnv,
        SRTE.chainW(({ cache }) =>
          pipe(
            // cache,
            // logReturn(_ =>
            //   cacheLogger.debug({ input: _.get().byDrivewsid['FOLDER::iCloud.md.obsidian::documents'].content.etag })
            // ),
            cache.putDetailss(actualDetails),
            // E.map(
            //   logReturn(_ =>
            //     cacheLogger.debug({ output: _.get().byDrivewsid['FOLDER::iCloud.md.obsidian::documents'].content.etag })
            //   ),
            // ),
            SRTE.fromEither,
            SRTE.chain(cache => SRTE.put(cache)),
            SRTE.map(() => result),
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
      SRTE.chain(({ cache }) => SRTE.fromTaskEither(Cache.trySaveFile(cache, cacheFile))),
    )

export const saveCacheFirst = <T>(cacheFile: string) =>
  (df: DriveM<T>) =>
    pipe(
      df,
      chain(v =>
        pipe(
          readEnv,
          SRTE.chain(({ cache }) => SRTE.fromTaskEither(Cache.trySaveFile(cache, cacheFile))),
          SRTE.chain(() => of(v)),
        )
      ),
    )

const shallowFolder = (details: DriveDetails): RecursiveFolder => ({
  details,
  deep: false,
})

const deepFolder = (details: DriveDetails, children: RecursiveFolder[]): RecursiveFolder => ({
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
  folders: DriveDetails[],
  itemByParentId: Record<string, RecursiveFolder[]>,
): (readonly [DriveDetails, RecursiveFolder[]])[] =>
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
