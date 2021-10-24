import { string } from 'fp-ts'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { constant, flow, identity, pipe } from 'fp-ts/lib/function'
import * as J from 'fp-ts/lib/Json'
import * as O from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import path from 'path'
import { isDeepStrictEqual } from 'util'
import {
  Cache,
  isDetailsCacheEntity,
  isFolderLikeCacheEntity,
  isRootCacheEntity,
} from '../../icloud/drive/cache/cachef'
import { CacheEntityAppLibrary, CacheEntityFolder } from '../../icloud/drive/cache/types'
import { Drive } from '../../icloud/drive/drive'
import { fileName, hierarchyToPath } from '../../icloud/drive/helpers'
import {
  DriveDetails,
  DriveDetailsPartialWithHierarchy,
  Hierarchy,
  HierarchyItem,
  isFolderDetails,
  isHierarchyItemRoot,
  isNotRootDetails,
  isRootDetails,
  rootDrivewsid,
} from '../../icloud/drive/types'
import { WasFolderChanged } from '../../icloud/drive/update'
import { error } from '../../lib/errors'
import { cliAction } from '../cli-action'
import { Env } from '../types'
type Output = string
type ErrorOutput = Error

type Change = 'ParentChanged'

const wasChanged = (
  cached: CacheEntityFolder,
  freshDetails: DriveDetails,
): WasFolderChanged => {
  return {
    etag: cached.content.etag !== freshDetails.etag,
    parentId: isNotRootDetails(freshDetails)
      && isNotRootDetails(cached.content)
      && cached.content.parentId !== freshDetails.parentId,
    details: !cached.hasDetails && isFolderDetails(freshDetails),
    wasRenamed: cached.content.name !== freshDetails.name,
    wasReplaced: cached.content.drivewsid !== freshDetails.drivewsid,
    newItems: [],
    removedItems: [],
  }
}

const wasAnythingChangedInFolderHierarchy = (
  cachedHierarchy: DriveDetailsPartialWithHierarchy,
  actualHierarchy: DriveDetailsPartialWithHierarchy,
) => {
  return {}
}

const compareHierarchies = (cached: Hierarchy, actual: Hierarchy) => {
  return {
    same: isDeepStrictEqual(cached, actual),
    path: hierarchyToPath(cached) !== hierarchyToPath(actual),
    pathByIds: !pipe(
      A.getEq(string.Eq).equals(
        cached.map(_ => _.drivewsid),
        actual.map(_ => _.drivewsid),
      ),
    ),
  }
}

const compareItems = (cached: HierarchyItem[], actual: HierarchyItem[]) => {
  return {
    same: isDeepStrictEqual(cached, actual),
    missing: pipe(
      A.difference(string.Eq)(
        cached.map(_ => _.drivewsid),
        actual.map(_ => _.drivewsid),
      ),
    ),
    new: pipe(
      A.difference(string.Eq)(
        actual.map(_ => _.drivewsid),
        cached.map(_ => _.drivewsid),
      ),
    ),
    etag: pipe(
      actual,
    ),
  }
}

const getCachedHierarchyByIdRecursive = (
  cache: Cache,
  drivewsid: string,
): E.Either<Error, Hierarchy> => {
  return pipe(
    E.Do,
    E.bind('item', () => cache.getFolderByIdE(drivewsid)),
    E.bind('path', () => cache.getCachedPathForIdE(drivewsid)),
    E.bind('result', ({ item }) =>
      isRootCacheEntity(item)
        ? E.of<Error, Hierarchy>([{ drivewsid: rootDrivewsid }])
        : pipe(
          getCachedHierarchyByIdRecursive(cache, item.content.parentId),
          E.map((
            h,
          ): Hierarchy => [...h, {
            drivewsid: item.content.drivewsid,
            name: item.content.name,
            etag: item.content.etag,
          }]),
        )),
    E.map(_ => _.result),
    // E.map(_ => {
    //   return pipe(
    //     _.result,
    //     A.dropRight(1),
    //   )
    // }),
  )
}

const getCachedHierarchyById = (
  cache: Cache,
  drivewsid: string,
) => {
  return pipe(
    getCachedHierarchyByIdRecursive(cache, drivewsid),
    E.map(A.dropRight(1)),
  )
}

const getCachedDetailsPartialWithHierarchyById = (
  cache: Cache,
  drivewsid: string,
): E.Either<Error, DriveDetailsPartialWithHierarchy> => {
  return pipe(
    E.Do,
    E.bind('details', () =>
      pipe(
        cache.getFolderByIdE(drivewsid),
        E.filterOrElse(isDetailsCacheEntity, () => error(`missing details`)),
      )),
    E.bind('hierarchy', () =>
      pipe(
        getCachedHierarchyByIdRecursive(cache, drivewsid),
        E.map(A.dropRight(1)),
      )),
    E.bind('items', ({ details }) =>
      E.of(details.content.items.map(item => ({
        drivewsid: item.drivewsid,
        name: item.name,
        etag: item.etag,
      })))),
    E.map(({ details, items, hierarchy }): DriveDetailsPartialWithHierarchy => ({
      ...details.content,
      items,
      hierarchy,
    })),
  )
}

const compareDriveDetailsPartialWithHierarchy = (
  cached: DriveDetailsPartialWithHierarchy,
  actual: DriveDetailsPartialWithHierarchy,
) => {
  return {
    etag: cached.etag !== actual.etag,
    name: cached.name !== actual.name,
    // parentId: cached.parentId !== actual.parentId,
    hierarchy: compareHierarchies(cached.hierarchy, actual.hierarchy),
    items: compareItems(cached.items, actual.items),
  }
}

export const update = (
  { sessionFile, cacheFile, path, raw, noCache, recursive, depth, dontSaveCache = true }: Env & {
    recursive: boolean
    path: string
    fullPath: boolean
    depth: number
    dontSaveCache?: boolean
  },
): TE.TaskEither<ErrorOutput, Output> => {
  return cliAction(
    { sessionFile, cacheFile, noCache, dontSaveCache },
    ({ cache, drive, api }) =>
      pipe(
        TE.Do,
        TE.bind('cached', () =>
          pipe(
            cache.getByPath(path),
            TE.fromOption(() => error(`missing ${path} in cache`)),
            TE.filterOrElse(isFolderLikeCacheEntity, () => error(`is not folder`)),
          )),
        TE.chain(({ cached }) => {
          return pipe(
            TE.Do,
            // TE.bind('changes', () =>
            //   drive.wasAnythingChangedInFolder(
            //     cached.content.drivewsid,
            //     wasChanged,
            //   )),
            TE.bind('hierarchy', () =>
              api.retrieveHierarchy(
                [cached.content.drivewsid],
              )),
            TE.bind('cachedHierarchy', () =>
              TE.fromEither(
                getCachedDetailsPartialWithHierarchyById(
                  cache,
                  cached.content.drivewsid,
                ),
              )),
            TE.bind('pathes', ({ cachedHierarchy, hierarchy }) =>
              TE.of({
                cached: hierarchyToPath(cachedHierarchy.hierarchy),
                actual: hierarchyToPath(hierarchy[0].hierarchy),
              })),
            TE.bind('changes', ({
              cachedHierarchy,
              hierarchy,
            }) => TE.of(compareDriveDetailsPartialWithHierarchy(cachedHierarchy, hierarchy[0]))),
            // TE.map(details => wasChanged(cached, details)),
          )
          // const etag = cached.content.etag
          // const parentChanged =
        }),
        // _ => _,
        TE.chain(flow(J.stringify, TE.fromEither)),
        TE.mapLeft((e) => error(`${e}`)),
        // TE.fold(() => async, identity),
      ),
  )
}
