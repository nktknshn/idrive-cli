import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import { cacheLogger, logger } from '../../../../util/logging'
import * as H from '../../get-by-path-types'
import { findInParentFilename } from '../../helpers'
import { Details, fileName, isTrashDetails, NonRootDetails, Root } from '../../icloud-drive-types'
import { FolderLikeMissingDetailsError, ItemIsNotFolderError, NotFoundError } from '../errors'
import * as C from './cache'
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
  (cache: CacheF): H.PathValidation<R> => {
    cacheLogger.debug(`getFromCacheByPath: [${path}], parent: ${showDetails(parentEntity)}`)

    if (!A.isNonEmpty(path)) {
      return { valid: true, details: [parentEntity], file: O.none }
    }

    const [subItemName, ...rest] = path
    const subitem = findInParentFilename(parentEntity, subItemName)

    const result: H.Hierarchy<R> = [parentEntity]

    // logger.debug(`subitem: ${O.getShow({ show: fileName }).show(subitem)}`)

    // item was not found
    if (O.isNone(subitem)) {
      return {
        valid: false,
        details: result,
        rest: path,
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
          details: result,
          rest: path,
          error: ItemIsNotFolderError.createTemplate(subitem.value),
        }
      }
      else {
        return {
          valid: true,
          details: [parentEntity],
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
          (e): H.PathValidation<R> => ({
            valid: false,
            details: result,
            rest: path,
            error: FolderLikeMissingDetailsError.create(`${subitem.value.drivewsid} needs details: ${e}`),
          }),
          ({ content, created }): H.PathValidation<R> =>
            pipe(
              getFromCacheByPath(rest, content)(cache),
              (result): H.PathValidation<R> =>
                result.valid
                  ? ({
                    valid: true,
                    details: H.concat([parentEntity], result.details),
                    file: result.file,
                  })
                  : ({
                    valid: false,
                    details: H.concat([parentEntity], result.details),
                    rest: result.rest,

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
        C.getFolderDetailsByIdE(subitem.value.drivewsid)(cache),
        E.fold(
          (e): H.PathValidation<R> => ({
            valid: false,
            details: result,
            rest: path,
            error: FolderLikeMissingDetailsError.create(`${subitem.value.drivewsid} needs details: ${e}`),
          }),
          ({ content }): H.PathValidation<R> => ({
            valid: true,
            details: H.concat([parentEntity], [content]),
            file: O.none,
          }),
        ),
      )
    }
  }
