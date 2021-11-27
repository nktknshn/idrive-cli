import * as A from 'fp-ts/lib/Array'
import { hole, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { hierarchyToPath, itemWithHierarchyToPath, NormalizedPath } from '../../../cli/actions/helpers'
import { err } from '../../../lib/errors'
import { logg, logger } from '../../../lib/logging'
import { Path } from '../../../lib/util'
import * as C from '../cache/cachef'
import { CacheEntityFolderLike, ICloudDriveCacheEntity } from '../cache/types'
import { ItemIsNotFolder } from '../errors'
import * as DF from '../fdrive'
import { fileName } from '../helpers'
import { DriveChildrenItemFile, DriveDetails, DriveFolderLike, Hierarchy, isFolderDetails } from '../types'
import { lookupCache } from './lookupCache'
import { log } from './ls'

// https://github.com/nktknshn/tgmount/issues/3#issuecomment-966905828

/*
  ensure the hierarchy (path) is same
  ensure it is still a folder
  cases:
    1. nothing changed
    2. target drivewsid was removed:
      - in this case we need to verify the cached hierarchy and take the first valid part of it
      - then unwind the target path starting from the last valid entry of the cached path
    3. target drivewsid was moved
*/
const onFoundInCacheFolderLikeA = (
  path: NormalizedPath,
  cachedEntity: ICloudDriveCacheEntity,
  cachedHierarchy: Hierarchy,
): DF.DriveM<DriveChildrenItemFile | DriveDetails> => {
  logger.debug(path)

  /*
  case when the path of the cached item was changed
  which means the input path points to a different item (either folder or file) or missing entity
  we need to verify which part of cachedHierarchy is still valid
  */
  const casePathChanged = (oldpath: string, newpath: string): DF.DriveM<DriveChildrenItemFile | DriveDetails> => {
    return pipe(
      logg(`Path changed: ${oldpath} -> ${newpath}`),
      () => DF.validateHierarchy(cachedHierarchy),
      SRTE.chain(({ validPart, rest }) =>
        pipe(
          A.isNonEmpty(validPart)
            ? DF.getActualRelative([...rest, fileName(cachedEntity.content)], NA.last(validPart))
            : DF.getActual(path),
        )
      ),
      DF.ensureDetailsC,
      // SRTE.filterOrElse(isFolderDetails, () => ItemIsNotFolder.create(`is not folder`)),
    )
  }

  return pipe(
    logg(`onFoundInCacheFolderLikeA`),
    () => DF.readEnv,
    DF.chain(({ api }) =>
      pipe(
        DF.getByPath(path),
      )
      // get actual details
      //   api.retrieveItemDetailsInFolderHierarchyO(
      //     cachedEntity.content.drivewsid,
      //   ),
      //   SRTE.fromTaskEither,
      //   SRTE.chain(O.fold(
      //     // when the cached item was removed from icloud
      //     () => DF.getByPath(path),
      //     // if it is present we need to verify if the path was changed or not
      //     details =>
      //       itemWithHierarchyToPath(details) == path
      //         ? SRTE.of(details)
      //         : casePathChanged(path, itemWithHierarchyToPath(details)),
      //   )),
      // )
    ),
  )
}

const showValidPart = (vp: CacheEntityFolderLike[]) =>
  pipe(
    vp,
    A.map(_ => _.content),
    _ => _.length > 0 ? hierarchyToPath(_) : '',
  )

export const ls2 = (path: NormalizedPath): DF.DriveM<DriveChildrenItemFile | DriveDetails> => {
  return pipe(
    path,
    lookupCache({
      onFoundInCacheFolderLike: onFoundInCacheFolderLikeA,
      onNotFoundInCache: (_, validPart, rest) =>
        pipe(
          logg(`onNotFoundInCache. Cached part: '${showValidPart(validPart)}', rest: ${Path.join(...rest)}`),
          () => DF.getByPath(path),
        ),
      onFoundInCacheFile: onFoundInCacheFolderLikeA,
    }),
  )
}
