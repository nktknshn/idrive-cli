import * as A from 'fp-ts/lib/Array'
import { constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as J from 'fp-ts/lib/Json'
import * as O from 'fp-ts/lib/Option'
import { snd } from 'fp-ts/lib/ReadonlyTuple'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import { Cache, isFolderLikeCacheEntity } from '../../icloud/drive/cache/cachef'
import { DriveApi } from '../../icloud/drive/drive-api'
import * as DF from '../../icloud/drive/drivef'
import { hierarchyToPath } from '../../icloud/drive/helpers'
import { DriveDetails, rootDrivewsid } from '../../icloud/drive/types'
import { error } from '../../lib/errors'
import { logger } from '../../lib/logging'
import { cliAction } from '../cli-action'
import { Env } from '../types'
import {
  compareDetails,
  compareDriveDetailsPartialWithHierarchy,
  getCachedDetailsPartialWithHierarchyById,
} from './helpers'

type Output = string
type ErrorOutput = Error

type Change = 'ParentChanged'
/*
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
} */
/*
const wasAnythingChangedInFolderHierarchy = (
  cachedHierarchy: DriveDetailsPartialWithHierarchy,
  actualHierarchy: DriveDetailsPartialWithHierarchy,
) => {
  return {}
}
 */
/*
const getCachedHierarchyById = (
  cache: Cache,
  drivewsid: string,
) => {
  return pipe(
    cache.getCachedHierarchyByIdRecursive(drivewsid),
    E.map(A.dropRight(1)),
  )
}
 */

// function updateCacheItemRecursive(
//   actualItem: FolderLikeItem,
//   cache: Cache,
//   api: DriveApi,
// ) {
//   return pipe(
//     cache.getById(actualItem.drivewsid),
//     O.fold(
//       () => cache.putItem(actualItem),
//       details =>
//         !details.hasDetails
//           ? cache.putItem(actualItem)
//           : pipe(
//             api.retrieveItemDetailsInFolder(actualItem.drivewsid),
//             TE.chain(updateCacheDetailsRecursive),
//           ),
//     ),
//   )
// }
/*
function updateCacheDetailsRecursive(
  actualDetails: DriveDetails,
  cache: Cache,
  api: DriveApi,
): TE.TaskEither<Error, Cache> {
  return pipe(
    cache.getById(actualDetails.drivewsid),
    O.fold(
      () => TE.fromEither(cache.putDetails(actualDetails)),
      details =>
        !details.hasDetails
          ? TE.fromEither(cache.putDetails(actualDetails))
          : pipe(
            compareDetails(details.content, actualDetails),
            ({ added, missing, updated }) =>
              pipe(
                missing.items.map(_ => _.drivewsid),
                cache.removeByIds,
                TE.of,
                TE.chain(cache => TE.of(cache)),
              ),
          ),
    ),
  )
} */

// export function updateFoldersDetailsRecursively(
//   drivewsids: string[],
//   cache: Cache,
//   api: DriveApi,
// ): TE.TaskEither<Error, DriveDetails[]> {
//   logger.debug({ updateFoldersDetailsRecursively: { drivewsids } })

//   return pipe(
//     cache.getByIds(drivewsids),
//     A.filterMap(O.chain(v => v.hasDetails ? O.some(v) : O.none)),
//     details =>
//       pipe(
//         TE.Do,
//         TE.bind('actualDetails', () =>
//           pipe(
//             details.map(_ => _.content.drivewsid),
//             api.retrieveItemDetailsInFoldersHierarchy,
//           )),
//         TE.bind('cache', ({ actualDetails }) =>
//           pipe(
//             A.zip(details, actualDetails),
//             A.map(([a, b]) => compareDetails(a.content, b)),
//             flow(
//               A.map(_ => _.updated.folders),
//               A.flatten,
//               A.map(snd),
//             ),
//             A.map(_ => _.drivewsid),
//             drivewsids =>
//               drivewsids.length > 0
//                 ? pipe(
//                   updateFoldersDetailsRecursively(drivewsids, cache, api),
//                   TE.map(A.concat(actualDetails)),
//                 )
//                 : TE.of(actualDetails),
//           )),
//         TE.chain(({ cache, actualDetails }) => TE.of(cache)),
//       ),
//   )
// }

export const checkForUpdates = ({
  sessionFile,
  cacheFile,
  path,
}: Env & {
  path: string
}) => {
  return cliAction(
    { sessionFile, cacheFile, noCache: false, dontSaveCache: true },
    ({ cache, api }) =>
      pipe(
        cache.getFolderByPathE(path),
        SRTE.fromEither,
        SRTE.chain(_ => DF.updateFoldersDetailsRecursively([_.content.drivewsid])),
        f => f(cache)(api),
        TE.chainFirst(([items, cache]) => Cache.trySaveFile(cache, cacheFile)),
        TE.map(fst),
      ),
    // pipe(
    //   TE.Do,
    //   TE.bind('result', () =>
    //     pipe(
    //       updateFoldersDetailsRecursively([rootDrivewsid], cache, api),
    //       TE.chain(updatedDetails =>
    //         pipe(
    //           updatedDetails,
    //           cache.putDetailss,
    //           TE.fromEither,
    //           TE.chain(Cache.trySaveFileF('data/updated-cache.json')),
    //           // A.map(_ => cache.getCachedPathForId(_.drivewsid)),
    //         )
    //       ),
    //     )),
    // ),
  )
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
            }) =>
              TE.of(
                compareDriveDetailsPartialWithHierarchy(cachedHierarchy, hierarchy[0]),
              )),
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
