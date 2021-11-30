import assert from 'assert'
import * as B from 'fp-ts/boolean'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, identity, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { Option } from 'fp-ts/lib/Option'
import * as O from 'fp-ts/lib/Option'
import { NormalizedPath } from '../../../cli/actions/helpers'
import { NEA } from '../../../lib/types'
import * as H from '../drivef/validation'
import { FolderLikeMissingDetailsError, ItemIsNotFolder, NotFoundError } from '../errors'
import * as DF from '../fdrive'
import { fileName, parsePath } from '../helpers'
import {
  DriveChildrenItem,
  DriveChildrenItemFile,
  DriveDetails,
  DriveDetailsRoot,
  isFolderDetails,
  isFolderLike,
} from '../types'
import * as C from './cachef'
import { CacheF } from './types'
import { findInParent } from './validatePath'

export type GetByPathVEResult =
  | { valid: true; path: H.Valid<DetailsPath>; file: O.Option<DriveChildrenItemFile> }
  | { valid: false; path: H.Partial<DetailsPath>; error: Error }

type DetailsPath = NEA<DriveDetails>

export const getPartialValidPathV2 = (
  path: string[],
  parentEntity: DriveDetails,
) =>
  (cache: CacheF): GetByPathVEResult => {
    if (A.isEmpty(path)) {
      return { valid: true, path: H.valid([parentEntity]), file: O.none }
    }

    assert(A.isNonEmpty(path))

    const subItemName = NA.head(path)
    const subitem = findInParent(parentEntity, subItemName)
    const rest = NA.tail(path)

    const result: NEA<DriveDetails> = [parentEntity]

    if (O.isNone(subitem)) {
      return {
        valid: false,
        path: H.partial<DetailsPath>(result, path),
        error: NotFoundError.createTemplate(subItemName, fileName(parentEntity)),
      }
    }

    if (subitem.value.type === 'FILE') {
      if (A.isNonEmpty(rest)) {
        return {
          valid: false,
          path: H.partial<DetailsPath>(result, path),
          error: ItemIsNotFolder.createTemplate(subitem.value),
        }
      }
      else {
        return {
          valid: true,
          path: H.valid<DetailsPath>([parentEntity]),
          file: O.some(subitem.value),
        }
      }
    }
    else {
      if (A.isNonEmpty(rest)) {
        // we need to go deeper

        return pipe(
          cache,
          C.getFolderDetailsByIdE(subitem.value.drivewsid),
          E.fold(
            (): GetByPathVEResult => ({
              valid: false,
              path: H.partial<DetailsPath>(result, path),
              error: FolderLikeMissingDetailsError.create(`${subitem.value.drivewsid} needs details`),
            }),
            ({ content }): GetByPathVEResult =>
              pipe(
                getPartialValidPathV2(rest, content)(cache),
                (result): GetByPathVEResult =>
                  result.valid
                    ? ({
                      valid: true,
                      path: H.valid<DetailsPath>(NA.concat([parentEntity], result.path.left)),
                      file: result.file,
                    })
                    : ({
                      valid: false,
                      path: H.partial<DetailsPath>(
                        NA.concat([parentEntity], result.path.left),
                        result.path.right,
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
              path: H.partial<DetailsPath>(result, path),
              error: FolderLikeMissingDetailsError.create(`${subitem.value.drivewsid} needs details`),
            }),
            ({ content }): GetByPathVEResult => ({
              valid: true,
              path: H.valid<DetailsPath>(NA.concat([parentEntity], [content])),
              file: O.none,
            }),
          ),
        )
      }
    }
  }
