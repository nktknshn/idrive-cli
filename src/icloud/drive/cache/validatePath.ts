import * as B from 'fp-ts/boolean'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, identity, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { Option } from 'fp-ts/lib/Option'
import * as O from 'fp-ts/lib/Option'
import { NormalizedPath } from '../../../cli/actions/helpers'
import { FolderLikeMissingDetailsError, ItemIsNotFolder, NotFoundError } from '../errors'
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

// points root
type PathRoot = {
  readonly tag: 'root'
  root: DriveDetailsRoot
}

// points anything relative to root
export type FullyCached = {
  readonly tag: 'full'
  // root: DriveDetailsRoot
  path: DriveDetails[]
  target: DriveDetails | DriveChildrenItemFile
}

export type PartialyCached = {
  readonly tag: 'partial'
  // root: DriveDetailsRoot
  error: Error
  path: DriveDetails[]
  rest: NA.NonEmptyArray<string>
}

const partial = (
  // root: DriveDetailsRoot,
  error: Error,
  path: DriveDetails[],
  rest: NA.NonEmptyArray<string>,
): PartialyCached => ({ error, path, rest, tag: 'partial' })

const full = (
  // root: DriveDetailsRoot,
  path: DriveDetails[],
  target: DriveDetails | DriveChildrenItemFile,
): FullyCached => ({ path, target, tag: 'full' })

type ZeroCached = {
  readonly tag: 'zero'
}

type Result = PathRoot | FullyCached | PartialyCached | ZeroCached

const findInParent = (parent: DriveDetails, itemName: string): O.Option<DriveChildrenItem> => {
  return pipe(
    parent.items,
    A.findFirst(item => fileName(item) == itemName),
  )
}

const go = (path: NA.NonEmptyArray<DriveDetails>, rest: string[], itemName: string) =>
  (cache: CacheF): E.Either<FullyCached | PartialyCached, {
    item: DriveDetails
    rest: NA.NonEmptyArray<string>
  }> => {
    const parent = NA.last(path)
    const item = findInParent(parent, itemName)
    const rest_ = NA.concat(NA.of(itemName), rest)

    const res: E.Either<FullyCached | PartialyCached, {
      item: DriveDetails
      rest: NA.NonEmptyArray<string>
    }> = pipe(
      item,
      O.fold(
        () => E.left(partial(NotFoundError.createTemplate(itemName, parent.drivewsid), path, rest_)),
        item => {
          return pipe(
            rest,
            A.matchW(
              () => {
                // item have to be a file or a folder with details
                return pipe(
                  isFolderLike(item)
                    ? pipe(cache, C.getFolderDetailsByIdE(item.drivewsid), E.map(_ => _.content))
                    : E.of<Error, DriveDetails | DriveChildrenItemFile>(item),
                  E.foldW(
                    error => E.left(partial(error, path, rest_)),
                    item => E.left(full(path, item)),
                  ),
                )
              },
              rest => {
                // item have to be a folder and has to have detais
                return pipe(
                  isFolderLike(item)
                    ? pipe(cache, C.getFolderDetailsByIdE(item.drivewsid), E.map(_ => ({ item: _.content, rest })))
                    : E.left(FolderLikeMissingDetailsError.create(`needs details`)),
                  E.mapLeft(error => partial(error, path, rest_)),
                )
              },
            ),
          )
        },
      ),
    )

    return res
  }

export function validatePath(
  cache: CacheF,
  parents: NA.NonEmptyArray<DriveDetails>,
  parts: NA.NonEmptyArray<string>,
): FullyCached | PartialyCached {
  const rest_ = NA.tail(parts)
  const itemName = NA.head(parts)

  return pipe(
    go(parents, rest_, itemName)(cache),
    E.fold(path => path, ({ item, rest }) => validatePath(cache, NA.concat(parents, NA.of(item)), rest)),
  )
}
