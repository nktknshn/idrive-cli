import * as A from 'fp-ts/Array'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/NonEmptyArray'
import { NormalizedPath, normalizePath, Path } from '../../../util/path'
import * as T from '../../icloud-drive-items-types'
import { FolderLikeMissingDetailsError, ItemIsNotFolderError, MissinRootError, NotFoundError } from '../errors'
import * as CT from './cache-types'

export const cacheEntityFromDetails = (
  details: T.Details,
): CT.CacheEntity =>
  T.isCloudDocsRootDetails(details)
    ? new CT.CacheEntityFolderRootDetails(details)
    : T.isTrashDetailsG(details)
    ? new CT.CacheEntityFolderTrashDetails(details)
    : details.type === 'FOLDER'
    ? new CT.CacheEntityFolderDetails(details)
    : new CT.CacheEntityAppLibraryDetails(details)

// export const cacheEntityFromItem = (
//   item: T.DriveChildrenItem,
// ): CT.CacheEntity => {
//   return item.type === 'FILE'
//     ? new CT.CacheEntityFile(item)
//     : item.type === 'FOLDER'
//     ? new CT.CacheEntityFolderItem(item)
//     : new CT.CacheEntityAppLibraryItem(item)
// }

export const assertFolderWithDetailsEntity = (
  entity: CT.CacheEntity,
): E.Either<ItemIsNotFolderError | FolderLikeMissingDetailsError, CT.CacheEntityDetails> =>
  pipe(
    E.of(entity),
    E.filterOrElse(CT.isFolderLikeCacheEntity, p =>
      ItemIsNotFolderError.create(`assertFolderWithDetails: ${p.content.drivewsid} is not a folder`)),
    E.filterOrElse(CT.isDetailsCacheEntity, p =>
      FolderLikeMissingDetailsError.create(`${p.content.drivewsid} is missing details`)),
  )

export const hierarchyToPath = (hierarchy: T.Hierarchy): NormalizedPath => {
  return pipe(
    hierarchy,
    A.map(hitem =>
      T.isHierarchyItemRoot(hitem)
        ? '/'
        : T.isHierarchyItemTrash(hitem)
        ? 'TRASH_ROOT/'
        : T.fileName(hitem)
    ),
    _ => _.length > 0 ? _.join('/') : '/',
    normalizePath,
  )
}

export function parsePath(path: string): NA.NonEmptyArray<string> {
  const parsedPath = Path.normalize(path)
    .replace(/^\//, '')
    .replace(/\/$/, '')
    .split('/')

  return parsedPath.length == 1 && parsedPath[0] == ''
    ? ['/']
    : ['/', ...parsedPath]
}
