import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import { cacheLogger, logger } from '../../../lib/logging'
import { NEA } from '../../../lib/types'
import { FolderLikeMissingDetailsError, ItemIsNotFolderError, NotFoundError } from '../errors'
import * as H from '../fdrive/validation'
import { findInParent } from '../helpers'
import { Details, DriveChildrenItemFile, fileName, isTrashDetails } from '../requests/types/types'
import * as C from './cachef'
import { CacheF } from './types'

/**
 * either valid (the path is fully present in cache)
 * or invalid
 */
export type GetByPathResult =
  | { valid: true; path: H.Valid<DetailsPath>; file: O.Option<DriveChildrenItemFile> }
  | { valid: false; path: H.Partial<DetailsPath>; error: Error }

type DetailsPath = NEA<Details>

const showDetails = (d: Details): string => {
  return isTrashDetails(d) ? 'TRASH' : `${d.type}: ${fileName(d)}`
}

/**
 * Tries to get starting from `parentEntity`
 */
export const getFromCacheByPath = (
  path: string[],
  parentEntity: Details,
) =>
  (cache: CacheF): GetByPathResult => {
    cacheLogger.debug(`getPartialValidPathV2: [${path}], parent: ${showDetails(parentEntity)}`)

    if (!A.isNonEmpty(path)) {
      return { valid: true, path: H.validPath([parentEntity]), file: O.none }
    }

    const [subItemName, ...rest] = path
    const subitem = findInParent(parentEntity, subItemName)

    const result: NEA<Details> = [parentEntity]

    logger.debug(`subitem: ${O.getShow({ show: fileName }).show(subitem)}`)

    // item was not found
    if (O.isNone(subitem)) {
      return {
        valid: false,
        path: H.partialPath<DetailsPath>(result, path),
        error: NotFoundError.createTemplate(
          subItemName,
          showDetails(parentEntity),
        ),
      }
    }

    if (subitem.value.type === 'FILE') {
      if (A.isNonEmpty(rest)) {
        return {
          valid: false,
          path: H.partialPath<DetailsPath>(result, path),
          error: ItemIsNotFolderError.createTemplate(subitem.value),
        }
      }
      else {
        return {
          valid: true,
          path: H.validPath<DetailsPath>([parentEntity]),
          file: O.some(subitem.value),
        }
      }
    }
    else if (A.isNonEmpty(rest)) {
      // sub item is a folder and we need to go deeper

      return pipe(
        cache,
        // BUG
        C.getFolderDetailsByIdE(subitem.value.drivewsid),
        E.fold(
          (): GetByPathResult => ({
            valid: false,
            path: H.partialPath<DetailsPath>(result, path),
            error: FolderLikeMissingDetailsError.create(`${subitem.value.drivewsid} needs details`),
          }),
          ({ content }): GetByPathResult =>
            pipe(
              getFromCacheByPath(rest, content)(cache),
              (result): GetByPathResult =>
                result.valid
                  ? ({
                    valid: true,
                    path: H.validPath<DetailsPath>(NA.concat([parentEntity], result.path.details)),
                    file: result.file,
                  })
                  : ({
                    valid: false,
                    path: H.partialPath<DetailsPath>(
                      NA.concat([parentEntity], result.path.details),
                      result.path.rest,
                    ),
                    error: result.error,
                  }),
            ),
        ),
      )
    }
    else {
      // sub item is a folder and since there is no rest
      // the item is the target. Get the details and return it
      return pipe(
        cache,
        C.getFolderDetailsByIdE(subitem.value.drivewsid),
        E.fold(
          (): GetByPathResult => ({
            valid: false,
            path: H.partialPath<DetailsPath>(result, path),
            error: FolderLikeMissingDetailsError.create(`${subitem.value.drivewsid} needs details`),
          }),
          ({ content }): GetByPathResult => ({
            valid: true,
            path: H.validPath<DetailsPath>(NA.concat([parentEntity], [content])),
            file: O.none,
          }),
        ),
      )
    }
  }
