import { apS, getApplySemigroup, sequenceS, sequenceT } from 'fp-ts/lib/Apply'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { apply, constant, flow, identity, pipe } from 'fp-ts/lib/function'
import * as J from 'fp-ts/lib/Json'
import * as O from 'fp-ts/lib/Option'
import * as ROR from 'fp-ts/lib/ReadonlyRecord'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { snd } from 'fp-ts/lib/Tuple'
import { compareDetails } from '../../cli/actions/helpers'
import { error } from '../../lib/errors'
import { cacheLogger, logger, logReturn } from '../../lib/logging'
import { Cache } from './cache/cachef'
import { DriveApi } from './drive-api'
import { fileName, parsePath } from './helpers'
import {
  DriveChildrenItem,
  DriveChildrenItemFile,
  DriveDetails,
  DriveDetailsRoot,
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

type DriveM<A> = SRTE.StateReaderTaskEither<Cache, DriveApi, Error, A>

const ado = sequenceS(SRTE.Apply)
const FolderLikeItemM = A.getMonoid<FolderLikeItem>()

const readEnv = sequenceS(SRTE.Apply)({
  cache: SRTE.get<Cache, DriveApi>(),
  api: SRTE.ask<Cache, DriveApi>(),
})

export const retrieveItemDetailsInFolders = (drivewsids: string[]): DriveM<DriveDetails[]> =>
  pipe(
    readEnv,
    SRTE.bind('task', ({ cache }) => SRTE.fromEither(cache.getFolderDetailsByIds(drivewsids))),
    SRTE.map(
      logReturn(({ task }) =>
        cacheLogger.debug(`${task.missed.length} missed caches (${task.missed}), ${task.cached.length} hits`)
      ),
    ),
    SRTE.chain(({ api, cache, task: { missed, cached } }) =>
      pipe(
        SRTE.fromTaskEither<Error, DriveDetails[], Cache, DriveApi>(
          missed.length > 0
            ? api.retrieveItemDetailsInFolders(missed)
            : TE.of([]),
        ),
        SRTE.chain(details =>
          pipe(
            cache.putDetailss(details),
            SRTE.fromEither,
            SRTE.chain(cache => SRTE.put(cache)),
            SRTE.chain(() => SRTE.of([...cached.map(_ => _.content), ...details])),
          )
        ),
      )
    ),
  )

const expectSome = SRTE.chainOptionK(() => error(`invalid response (empty array)`))

export const retrieveItemDetailsInFolder = (drivewsid: string): DriveM<DriveDetails> =>
  pipe(
    retrieveItemDetailsInFolders([drivewsid]),
    expectSome(A.lookup(0)),
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

export const getFolderRecursive = (
  path: string,
  depth: number,
): DriveM<RecursiveFolder> =>
  pipe(
    readEnv,
    SRTE.bind('parent', () => getFolderByPath(path)),
    SRTE.bind('children', ({ parent }) => getFoldersRecursively([parent.drivewsid], depth)),
    expectSome((_) => A.lookup(0, _.children)),
  )

export const getFolderByPath = (path: string): DriveM<DriveDetails> =>
  pipe(
    getFileOrDetailsByPath(path),
    SRTE.filterOrElse(isFolderDetails, () => error(`is not folder`)),
  )

export const getFileOrDetailsByPath = (
  path: string,
): DriveM<DriveDetails | DriveChildrenItemFile> =>
  pipe(
    getItemByPath(path),
    SRTE.chain(item =>
      isFolderLike(item)
        ? retrieveItemDetailsInFolder(item.drivewsid)
        : SRTE.of(item as DriveDetails | DriveChildrenItemFile)
    ),
  )

export const getItemByPath = (path: string): DriveM<DriveDetails | DriveChildrenItem> => {
  const [, ...parsedPath] = parsePath(path)

  return pipe(
    parsedPath,
    A.reduce(
      pipe(
        getRoot(),
        SRTE.map(v => v as DriveDetails | DriveChildrenItem),
      ),
      (parent, itemName) =>
        pipe(
          ado({
            parent: pipe(
              parent,
              SRTE.filterOrElse(isFolderDetails, p => error(`${p.drivewsid} is not a folder`)),
            ),
          }),
          SRTE.bind('item', ({ parent }) =>
            SRTE.fromOption(() =>
              error(`item "${itemName}" was not found in "${parent.name}" (${parent.drivewsid})`)
            )(
              pipe(parent.items, A.findFirst(item => itemName == fileName(item))),
            )),
          SRTE.chain(({ item }) =>
            isFile(item)
              ? SRTE.of(item as DriveDetails | DriveChildrenItem)
              : retrieveItemDetailsInFolder(item.drivewsid)
          ),
        ),
    ),
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

export const updateFoldersDetails = (
  drivewsids: string[],
): DriveM<DriveDetails[]> => {
  return pipe(
    readEnv,
    SRTE.chainW(({ api, cache }) =>
      pipe(
        api.retrieveItemDetailsInFoldersHierarchy(drivewsids),
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

export const updateFoldersDetailsRecursively = (
  drivewsids: string[],
): DriveM<DriveDetails[]> => {
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
        api.retrieveItemDetailsInFoldersHierarchy,
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
