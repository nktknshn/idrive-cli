import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { NormalizedPath } from '../../../cli/actions/helpers'
import { isFolderLikeCacheEntity } from '../../../icloud/drive/cache/cachef'
import { CacheEntityFile, CacheEntityFolderLike } from '../../../icloud/drive/cache/types'
import { DriveChildrenItemFile, DriveDetails, Hierarchy } from '../../../icloud/drive/types'
import * as DF from '../fdrive'
import { log } from './ls'

export const lookupCache = (
  opts: {
    onFoundInCacheFolderLike: (
      path: NormalizedPath,
      entity: CacheEntityFolderLike,
      cachedHierarchy: Hierarchy,
    ) => DF.DriveM<DriveChildrenItemFile | DriveDetails>
    onFoundInCacheFile: (
      path: NormalizedPath,
      entity: CacheEntityFile,
      cachedHierarchy: Hierarchy,
    ) => DF.DriveM<DriveChildrenItemFile | DriveDetails>
    onNotFoundInCache: (
      path: NormalizedPath,
      validPart: CacheEntityFolderLike[],
      rest: NA.NonEmptyArray<string>,
    ) => DF.DriveM<DriveChildrenItemFile | DriveDetails>
  },
) =>
  (path: NormalizedPath): DF.DriveM<DriveChildrenItemFile | DriveDetails> => {
    const res = pipe(
      DF.readEnv,
      log(`lookupCache: ${path}`),
      SRTE.bind('vpath', ({ cache }) => SRTE.of(cache.getByPathV(path))),
      // SRTE.bind('hierarchy', ({ cache }) => SRTE.fromEither(cache.getCachedHierarchyById(path))),
      SRTE.chain(({ vpath, cache }) =>
        pipe(
          vpath.valid
            ? pipe(
              cache.getCachedHierarchyById(vpath.last.content.drivewsid),
              SRTE.fromEither,
              SRTE.chain(h =>
                isFolderLikeCacheEntity(vpath.last)
                  ? opts.onFoundInCacheFolderLike(path, vpath.last, h)
                  : opts.onFoundInCacheFile(path, vpath.last, h)
              ),
            )
            : opts.onNotFoundInCache(path, vpath.validPart, vpath.rest),
        )
      ),
    )

    return res
  }
