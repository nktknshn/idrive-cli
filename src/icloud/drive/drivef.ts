import { string } from 'fp-ts'
import { apS, getApplySemigroup, sequenceS, sequenceT } from 'fp-ts/lib/Apply'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { apply, constant, constVoid, flow, identity, pipe } from 'fp-ts/lib/function'
import { Functor, Functor1, map } from 'fp-ts/lib/Functor'
import { URIS } from 'fp-ts/lib/HKT'
import * as J from 'fp-ts/lib/Json'
import * as O from 'fp-ts/lib/Option'
import * as ROR from 'fp-ts/lib/ReadonlyRecord'
import * as R from 'fp-ts/lib/Record'
import { Semigroup } from 'fp-ts/lib/Semigroup'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { snd } from 'fp-ts/lib/Tuple'
import { compareDetails } from '../../cli/actions/helpers'
import { error } from '../../lib/errors'
import { cacheLogger, logger, logReturn, logReturnAs } from '../../lib/logging'
import { cast } from '../../lib/util'
import { Cache, isFolderLikeCacheEntity, PartialValidPath } from './cache/cachef'
import { DriveApi } from './drive-api'
import { fileName, parsePath } from './helpers'
import {
  DriveChildrenItem,
  DriveChildrenItemFile,
  DriveDetails,
  DriveDetailsRoot,
  DriveDetailsWithHierarchy,
  DriveFolderLike,
  DriveItemDetails,
  FolderLikeItem,
  isFile,
  isFolderDetails,
  isFolderLike,
  isFolderLikeItem,
  isNotRootDetails,
  isRootDetails,
  RecursiveFolder,
  rootDrivewsid,
} from './types'

export { ls } from './drivef/ls'

export type DriveM<A> = SRTE.StateReaderTaskEither<Cache, DriveApi, Error, A>

const ado = sequenceS(SRTE.Apply)
const FolderLikeItemM = A.getMonoid<FolderLikeItem>()

export const readEnv = sequenceS(SRTE.Apply)({
  cache: SRTE.get<Cache, DriveApi>(),
  api: SRTE.ask<Cache, DriveApi>(),
})

// export const retrieveItemDetailsInFoldersHierarchy = (drivewsids: string[]): DriveM<DriveDetailsWithHierarchy[]> => {
//   pipe(
//     readEnv,
//     SRTE.bind('task', ({ cache }) => SRTE.fromEither(cache.getFolderDetailsByIds(drivewsids))),
//   )
// }

export const retrieveItemDetailsInFolders = (drivewsids: string[]): DriveM<DriveDetails[]> =>
  pipe(
    readEnv,
    SRTE.bind('task', ({ cache }) => SRTE.fromEither(cache.getFolderDetailsByIds(drivewsids))),
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
            SRTE.fromTaskEither<Error, DriveDetails[], Cache, DriveApi>(
              missed.length > 0
                ? api.retrieveItemDetailsInFolders(missed)
                : TE.of([]),
            ),
            SRTE.chain(details =>
              pipe(
                putDetailss(details),
                // cache.putDetailss(details),
                // SRTE.fromEither,
                // SRTE.chain(cache => SRTE.put(cache)),
                SRTE.chain(() => SRTE.of([...cached.map(_ => _.content), ...details])),
              )
            ),
          )
        ),
      )
    ),
    // SRTE.chainFirstW(logCache()),
  )

export const expectSome = SRTE.chainOptionK(() => error(`invalid response (empty array)`))

export const retrieveItemDetailsInFolder = (drivewsid: string): DriveM<DriveDetails> =>
  pipe(
    retrieveItemDetailsInFolders([drivewsid]),
    expectSome(A.lookup(0)),
    // SRTE.chainFirstW(logCache()),
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
    SRTE.filterOrElseW(isRootDetails, () => error(`invalid root details`)),
  )

export const getFolderDetailsById = retrieveItemDetailsInFolder

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
    SRTE.filterOrElse(isFolderDetails, () => error(`is not folder`)),
  )

export const getFileOrFolderByPath = (
  path: string,
): DriveM<DriveDetails | DriveChildrenItemFile> =>
  pipe(
    getItemByPath(path),
    SRTE.chain(item =>
      isFolderLike(item) && !isFolderDetails(item)
        ? retrieveItemDetailsInFolder(item.drivewsid)
        : SRTE.of(item)
    ),
  )

export const ensureDetails = (
  itemOrDetails: DriveFolderLike | DriveChildrenItemFile,
): DriveM<DriveDetails | DriveChildrenItemFile> =>
  pipe(
    isFolderLike(itemOrDetails) && !isFolderDetails(itemOrDetails)
      ? retrieveItemDetailsInFolder(itemOrDetails.drivewsid)
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
  logger.debug(`getItemByPathRelativeG: ${path} ${parent.drivewsid}`)
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
                  ? SRTE.left(error(`${parent.drivewsid} is not a folder`))
                  : !isFolderDetails(parent)
                  ? retrieveItemDetailsInFolder(parent.drivewsid)
                  : SRTE.of(parent)
              ),
            ),
          }),
          SRTE.bind('item', ({ parent }) =>
            SRTE.fromOption(() =>
              error(`item "${itemName}" was not found in "${parent.name}" (${parent.drivewsid})`)
            )(
              pipe(parent.items, A.findFirst(item => itemName == fileName(item))),
            )),
          SRTE.map(_ => _.item),
          // SRTE.chain(({ item }): DriveM<DriveDetails | DriveChildrenItemFile> =>
          //   isFile(item)
          //     ? SRTE.of(item)
          //     : retrieveItemDetailsInFolder(item.drivewsid)
          // ),
        ),
    ),
    // SRTE.chainFirstW(logCache()),
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
    getFolderDetailsById(parentId),
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
      folders: retrieveItemDetailsInFolders(drivewsids),
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
): DriveM<DriveDetailsWithHierarchy[]> =>
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
): DriveM<DriveDetailsWithHierarchy> =>
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

export const putItems = (detailss: DriveItemDetails[]): DriveM<void> =>
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
): DriveM<DriveDetailsWithHierarchy[]> => {
  return pipe(
    readEnv,
    SRTE.chainW(({ api, cache }) =>
      pipe(
        api.retrieveItemDetailsInFoldersHierarchies(drivewsids),
        SRTE.fromTaskEither,
        SRTE.chain(details =>
          pipe(
            cache.putDetailss(details),
            SRTE.fromEither,
            SRTE.chain(cache => SRTE.put(cache)),
            SRTE.map(() => details),
          )
        ),
      )
    ),
  )
}

// export const move = (
//   srcpath: string,
//   dstpath: string,
// ): DriveM<DriveDetailsWithHierarchy> =>
//   pipe(
//     readEnv,
//     SRTE.chainW(({ cache }) =>
//       pipe(
//         cache.getFolderByPathE(path),
//         SRTE.fromEither,
//         SRTE.chain(_ => updateFoldersDetails([_.content.drivewsid])),
//         expectSome(A.lookup(0)),
//       )
//     ),
//   )

export const updateFoldersDetailsRecursively = (
  drivewsids: string[],
): DriveM<DriveDetailsWithHierarchy[]> => {
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
        api.retrieveItemDetailsInFoldersHierarchies,
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
