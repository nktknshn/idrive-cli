import assert from 'assert'
import * as B from 'fp-ts/boolean'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, identity, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { Option } from 'fp-ts/lib/Option'
import * as O from 'fp-ts/lib/Option'
import { NormalizedPath } from '../../../cli/cli-drive/cli-drive-actions/helpers'
import { cacheLogger, logger } from '../../../lib/logging'
import { NEA } from '../../../lib/types'
import * as H from '../drivef/validation'
import { FolderLikeMissingDetailsError, ItemIsNotFolderError, NotFoundError } from '../errors'
import * as DF from '../fdrive'
import {
  Details,
  DetailsRoot,
  DetailsTrash,
  DriveChildrenItem,
  DriveChildrenItemFile,
  fileName,
  isDetails,
  isFolderLike,
  isTrashDetails,
} from '../types'
import { trashDrivewsid } from '../types-io'
import * as C from './cachef'
import { CacheF } from './types'
import { findInParent } from './validatePath'

export type GetByPathVEResult =
  | { valid: true; path: H.Valid<DetailsPath>; file: O.Option<DriveChildrenItemFile> }
  | { valid: false; path: H.Partial<DetailsPath>; error: Error }

type DetailsPath = NEA<Details>

const showDetails = (d: Details): string => {
  return isTrashDetails(d) ? 'TRASH' : `${d.type}: ${fileName(d)}`
}

export const getPartialValidPathV2 = (
  path: string[],
  parentEntity: Details,
) =>
  (cache: CacheF): GetByPathVEResult => {
    cacheLogger.debug(`getPartialValidPathV2: [${path}], parent: ${showDetails(parentEntity)}`)

    if (A.isEmpty(path)) {
      return { valid: true, path: H.validPath([parentEntity]), file: O.none }
    }

    assert(A.isNonEmpty(path))

    const subItemName = NA.head(path)
    const subitem = findInParent(parentEntity, subItemName)
    const rest = NA.tail(path)

    const result: NEA<Details> = [parentEntity]

    logger.debug(`subitem: ${pipe(subitem, O.fold(() => `None`, si => `Some(${fileName(si)})`))}`)

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
    else {
      if (A.isNonEmpty(rest)) {
        // we need to go deeper

        return pipe(
          cache,
          // BUG
          C.getFolderDetailsByIdE(subitem.value.drivewsid),
          E.fold(
            (): GetByPathVEResult => ({
              valid: false,
              path: H.partialPath<DetailsPath>(result, path),
              error: FolderLikeMissingDetailsError.create(`${subitem.value.drivewsid} needs details`),
            }),
            ({ content }): GetByPathVEResult =>
              pipe(
                getPartialValidPathV2(rest, content)(cache),
                (result): GetByPathVEResult =>
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
        // the item is the target. Get the details and return
        return pipe(
          cache,
          C.getFolderDetailsByIdE(subitem.value.drivewsid),
          E.fold(
            (): GetByPathVEResult => ({
              valid: false,
              path: H.partialPath<DetailsPath>(result, path),
              error: FolderLikeMissingDetailsError.create(`${subitem.value.drivewsid} needs details`),
            }),
            ({ content }): GetByPathVEResult => ({
              valid: true,
              path: H.validPath<DetailsPath>(NA.concat([parentEntity], [content])),
              file: O.none,
            }),
          ),
        )
      }
    }
  }
