import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as T from '../drive-types'
import { FolderLikeMissingDetailsError, ItemIsNotFolderError, MissinRootError, NotFoundError } from '../errors'
import * as C from './cache-types'

export const cacheEntityFromDetails = (
  details: T.Details,
): C.CacheEntity =>
  T.isCloudDocsRootDetails(details)
    ? new C.CacheEntityFolderRootDetails(details)
    : T.isTrashDetailsG(details)
    ? new C.CacheEntityFolderTrashDetails(details)
    : details.type === 'FOLDER'
    ? new C.CacheEntityFolderDetails(details)
    : new C.CacheEntityAppLibraryDetails(details)

export const cacheEntityFromItem = (
  item: T.DriveChildrenItem,
): C.CacheEntity => {
  return item.type === 'FILE'
    ? new C.CacheEntityFile(item)
    : item.type === 'FOLDER'
    ? new C.CacheEntityFolderItem(item)
    : new C.CacheEntityAppLibraryItem(item)
}

export const assertFolderWithDetailsEntity = (
  entity: C.CacheEntity,
): E.Either<ItemIsNotFolderError | FolderLikeMissingDetailsError, C.CacheEntityDetails> =>
  pipe(
    E.of(entity),
    E.filterOrElse(C.isFolderLikeCacheEntity, p =>
      ItemIsNotFolderError.create(`assertFolderWithDetails: ${p.content.drivewsid} is not a folder`)),
    E.filterOrElse(C.isDetailsCacheEntity, p =>
      FolderLikeMissingDetailsError.create(`${p.content.drivewsid} is missing details`)),
  )
