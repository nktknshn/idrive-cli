import * as B from 'fp-ts/boolean'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, identity, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { Option } from 'fp-ts/lib/Option'
import * as O from 'fp-ts/lib/Option'
import { NormalizedPath } from '../../../cli/actions/helpers'
import { FolderLikeMissingDetailsError, ItemIsNotFolderError, NotFoundError } from '../errors'
import * as DF from '../fdrive'
import { fileName, parsePath } from '../helpers'
import { Details, DetailsRoot, DriveChildrenItem, DriveChildrenItemFile, isDetails, isFolderLike } from '../types'
import * as C from './cachef'
import { CacheF } from './types'

// points root
type PathRoot = {
  readonly tag: 'root'
  root: DetailsRoot
}

// points anything relative to root
export type FullyCached = {
  readonly tag: 'full'
  // root: DriveDetailsRoot
  path: NA.NonEmptyArray<Details>
  target: Details | DriveChildrenItemFile
}

export type PartialyCached = {
  readonly tag: 'partial'
  // root: DriveDetailsRoot
  error: Error
  path: Details[]
  rest: NA.NonEmptyArray<string>
}

export const partialPath = (
  // root: DriveDetailsRoot,
  error: Error,
  path: Details[],
  rest: NA.NonEmptyArray<string>,
): PartialyCached => ({ error, path, rest, tag: 'partial' })

export const fullPath = (
  // root: DriveDetailsRoot,
  path: NA.NonEmptyArray<Details>,
  target: Details | DriveChildrenItemFile,
): FullyCached => ({ path, target, tag: 'full' })

type ZeroCached = {
  readonly tag: 'zero'
}

type Result = PathRoot | FullyCached | PartialyCached | ZeroCached

export const findInParent = (parent: Details, itemName: string): O.Option<DriveChildrenItem> => {
  return pipe(
    parent.items,
    A.findFirst(item => fileName(item) == itemName),
  )
}

const go = (path: NA.NonEmptyArray<Details>, rest: string[], itemName: string) =>
  (cache: CacheF): E.Either<FullyCached | PartialyCached, {
    item: Details
    rest: NA.NonEmptyArray<string>
  }> => {
    const parent = NA.last(path)
    const item = findInParent(parent, itemName)
    const rest_ = NA.concat(NA.of(itemName), rest)

    const res: E.Either<FullyCached | PartialyCached, {
      item: Details
      rest: NA.NonEmptyArray<string>
    }> = pipe(
      item,
      O.fold(
        () => E.left(partialPath(NotFoundError.createTemplate(itemName, parent.drivewsid), path, rest_)),
        item => {
          return pipe(
            rest,
            A.matchW(
              () => {
                // item have to be a file or a folder with details
                return pipe(
                  isFolderLike(item)
                    ? pipe(cache, C.getFolderDetailsByIdE(item.drivewsid), E.map(_ => _.content))
                    : E.of<Error, Details | DriveChildrenItemFile>(item),
                  E.foldW(
                    error => E.left(partialPath(error, path, rest_)),
                    item => E.left(fullPath(path, item)),
                  ),
                )
              },
              rest => {
                // item have to be a folder and has to have detais
                return pipe(
                  isFolderLike(item)
                    ? pipe(cache, C.getFolderDetailsByIdE(item.drivewsid), E.map(_ => ({ item: _.content, rest })))
                    : E.left(FolderLikeMissingDetailsError.create(`needs details`)),
                  E.mapLeft(error => partialPath(error, path, rest_)),
                )
              },
            ),
          )
        },
      ),
    )

    return res
  }

export const validatePath = (
  parents: NA.NonEmptyArray<Details>,
  parts: NA.NonEmptyArray<string>,
) =>
  (cache: CacheF): FullyCached | PartialyCached => {
    const rest_ = NA.tail(parts)
    const itemName = NA.head(parts)

    return pipe(
      go(parents, rest_, itemName)(cache),
      E.fold(
        identity,
        ({ item, rest }) => validatePath(NA.concat(parents, NA.of(item)), rest)(cache),
      ),
    )
  }
