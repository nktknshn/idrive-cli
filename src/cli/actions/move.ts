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
import { err } from '../../lib/errors'
import { logger } from '../../lib/logging'
import { cliAction } from '../cli-action'
import { Env } from '../types'
import { compareDetails, compareItemWithHierarchy, getCachedDetailsPartialWithHierarchyById } from './helpers'

type Output = string
type ErrorOutput = Error

type Change = 'ParentChanged'

export const move = ({
  sessionFile,
  cacheFile,
  srcpath,
  dstpath,
  noCache,
}: Env & {
  srcpath: string
  dstpath: string
}) => {
  return cliAction(
    { sessionFile, cacheFile, noCache, dontSaveCache: true },
    ({ cache, api }) =>
      pipe(
        cache.getByPathE(srcpath),
        SRTE.fromEither,
        f => f(cache)(api),
        // SRTE.fromEither,
        // SRTE.chain(_ => DF.move(srcpath, dstpath)),
        // f => f(cache)(api),
        // !noCache
        //   ? TE.chainFirst(([items, cache]) => Cache.trySaveFile(cache, cacheFile))
        //   : TE.chainFirst(() => TE.of(constVoid())),
        // TE.map(fst),
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
