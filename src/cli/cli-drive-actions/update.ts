import * as A from 'fp-ts/lib/Array'
import { constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as J from 'fp-ts/lib/Json'
import * as O from 'fp-ts/lib/Option'
import { snd } from 'fp-ts/lib/ReadonlyTuple'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import { Cache } from '../../icloud/drive/cache/Cache'
import { isFolderLikeCacheEntity } from '../../icloud/drive/cache/cachef'
import { DriveApi } from '../../icloud/drive/drive-api'
import * as DF from '../../icloud/drive/fdrive'
import { err } from '../../lib/errors'
import { logger } from '../../lib/logging'
import { cliAction } from '../cli-action'
import { Env } from '../types'
import {
  compareDetails,
  compareItemWithHierarchy,
  getCachedDetailsPartialWithHierarchyById,
  hierarchyToPath,
  normalizePath,
} from './helpers'

type Output = string
type ErrorOutput = Error

type Change = 'ParentChanged'

export const checkForUpdates = ({
  sessionFile,
  cacheFile,
  path,
}: Env & {
  path: string
}) => {
  return cliAction(
    { sessionFile, cacheFile, noCache: false },
    ({ cache, api }) =>
      pipe(
        cache.getFolderByPathE(normalizePath(path)),
        SRTE.fromEither,
        SRTE.chain(_ => DF.updateFoldersDetailsRecursively([_.content.drivewsid])),
        f => f(cache)({ api }),
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
  { sessionFile, cacheFile, path, raw, noCache, recursive, depth }: Env & {
    recursive: boolean
    path: string
    fullPath: boolean
    depth: number
  },
): TE.TaskEither<ErrorOutput, Output> => {
  return cliAction(
    { sessionFile, cacheFile, noCache },
    ({ cache, api }) =>
      pipe(
        TE.Do,
        TE.bind('cached', () =>
          pipe(
            cache.getByPath(path),
            TE.fromOption(() => err(`missing ${path} in cache`)),
            TE.filterOrElse(isFolderLikeCacheEntity, () => err(`is not folder`)),
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
                compareItemWithHierarchy(cachedHierarchy, hierarchy[0]),
              )),
            // TE.map(details => wasChanged(cached, details)),
          )
          // const etag = cached.content.etag
          // const parentChanged =
        }),
        // _ => _,
        TE.chain(flow(J.stringify, TE.fromEither)),
        TE.mapLeft((e) => err(`${e}`)),
        // TE.fold(() => async, identity),
      ),
  )
}
