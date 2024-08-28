import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'

import { cacheLogger } from '../../../logging/logging'
import * as Types from '../../drive-types'
import { findInParentFilename } from '../../util/drive-helpers'
import * as GetByPath from '../../util/get-by-path-types'
import { FolderLikeMissingDetailsError, ItemIsNotFolderError, NotFoundError } from '../errors'
import * as C from './cache'
import { CacheF } from './cache-types'

const showDetails = (d: Types.Details): string => {
  return Types.isTrashDetails(d) ? 'TRASH' : `${d.type}: ${Types.fileName(d)}`
}

/**
 * Tries to get starting from `parentEntity`
 */
export const getFromCacheByPath = <R extends Types.Root | Types.NonRootDetails>(
  path: string[],
  parentEntity: R,
) =>
  (cache: CacheF): GetByPath.PathValidation<R> => {
    cacheLogger.debug(`getFromCacheByPath: [${path}], parent: ${showDetails(parentEntity)}`)

    if (!A.isNonEmpty(path)) {
      return GetByPath.validFolder<R>([parentEntity])
    }

    const [subItemName, ...rest] = path
    const subitem = findInParentFilename(parentEntity, subItemName)

    const result: GetByPath.Hierarchy<R> = [parentEntity]

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
        return GetByPath.validFile<R>(
          result,
          subitem.value,
        )
      }
    }
    else if (A.isNonEmpty(rest)) {
      // sub item is a folder and we need to go deeper

      return pipe(
        // BUG
        C.getFolderDetailsByIdE(subitem.value.drivewsid)(cache),
        E.fold(
          (e): GetByPath.PathValidation<R> => ({
            valid: false,
            details: result,
            rest: path,
            error: FolderLikeMissingDetailsError.create(`${subitem.value.drivewsid} needs details: ${e}`),
          }),
          ({ content, created }): GetByPath.PathValidation<R> =>
            pipe(
              getFromCacheByPath(rest, content)(cache),
              (result): GetByPath.PathValidation<R> =>
                result.valid
                  ? GetByPath.validPath<R>(
                    GetByPath.concat([parentEntity], result.details),
                    GetByPath.getFile(result),
                  )
                  : GetByPath.invalidPath<R>(
                    GetByPath.concat([parentEntity], result.details),
                    result.rest,
                    result.error,
                  ),
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
          (e): GetByPath.PathValidation<R> => ({
            valid: false,
            details: result,
            rest: path,
            error: FolderLikeMissingDetailsError.create(`${subitem.value.drivewsid} needs details: ${e}`),
          }),
          ({ content }): GetByPath.PathValidation<R> =>
            GetByPath.validFolder<R>(GetByPath.concat([parentEntity], [content])),
        ),
      )
    }
  }
