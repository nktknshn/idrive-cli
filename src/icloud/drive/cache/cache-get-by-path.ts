import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import { cacheLogger, logger } from '../../../lib/logging'
import { FolderLikeMissingDetailsError, ItemIsNotFolderError, NotFoundError } from '../errors'
import * as H from '../ffdrive/validation'
import { findInParent } from '../helpers'
import { Details, fileName, isTrashDetails, NonRootDetails, Root } from '../requests/types/types'
import * as C from './cache'
import { PathValidation } from './cache-get-by-path-types'
import { CacheF } from './cache-types'

const showDetails = (d: Details): string => {
  return isTrashDetails(d) ? 'TRASH' : `${d.type}: ${fileName(d)}`
}

/**
 * Tries to get starting from `parentEntity`
 */
export const getFromCacheByPath = <R extends Root | NonRootDetails>(
  path: string[],
  parentEntity: R,
) =>
  (cache: CacheF): PathValidation<H.Hierarchy<R>> => {
    cacheLogger.debug(`getPartialValidPathV2: [${path}], parent: ${showDetails(parentEntity)}`)

    if (!A.isNonEmpty(path)) {
      return { valid: true, path: H.validPath([parentEntity]), file: O.none }
    }

    const [subItemName, ...rest] = path
    const subitem = findInParent(parentEntity, subItemName)

    const result: H.Hierarchy<R> = [parentEntity]

    logger.debug(`subitem: ${O.getShow({ show: fileName }).show(subitem)}`)

    // item was not found
    if (O.isNone(subitem)) {
      return {
        valid: false,
        path: H.partialPath<H.Hierarchy<R>>(result, path),
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
          path: H.partialPath<H.Hierarchy<R>>(result, path),
          error: ItemIsNotFolderError.createTemplate(subitem.value),
        }
      }
      else {
        return {
          valid: true,
          path: H.validPath<H.Hierarchy<R>>([parentEntity]),
          file: O.some(subitem.value),
        }
      }
    }
    else if (A.isNonEmpty(rest)) {
      // sub item is a folder and we need to go deeper

      return pipe(
        // BUG
        C.getFolderDetailsByIdE(subitem.value.drivewsid)(cache),
        E.fold(
          (): PathValidation<H.Hierarchy<R>> => ({
            valid: false,
            path: H.partialPath<H.Hierarchy<R>>(result, path),
            error: FolderLikeMissingDetailsError.create(`${subitem.value.drivewsid} needs details`),
          }),
          ({ content, created }): PathValidation<H.Hierarchy<R>> =>
            pipe(
              getFromCacheByPath(rest, content)(cache),
              (result): PathValidation<H.Hierarchy<R>> =>
                result.valid
                  ? ({
                    valid: true,
                    path: H.validPath<H.Hierarchy<R>>(H.concat([parentEntity], result.path.details)),
                    file: result.file,
                  })
                  : ({
                    valid: false,
                    path: H.partialPath<H.Hierarchy<R>>(
                      H.concat([parentEntity], result.path.details),
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
          (): PathValidation<H.Hierarchy<R>> => ({
            valid: false,
            path: H.partialPath<H.Hierarchy<R>>(result, path),
            error: FolderLikeMissingDetailsError.create(`${subitem.value.drivewsid} needs details`),
          }),
          ({ content }): PathValidation<H.Hierarchy<R>> => ({
            valid: true,
            path: H.validPath<H.Hierarchy<R>>(H.concat([parentEntity], [content])),
            file: O.none,
          }),
        ),
      )
    }
  }
