import * as T from '../requests/types/types'

export interface CacheF {
  readonly byDrivewsid: { readonly [drivewsid: string]: CacheEntity }
}

export type CacheEntityDetails =
  | CacheEntityFolderTrashDetails
  | CacheEntityFolderRootDetails
  | CacheEntityFolderDetails
  | CacheEntityAppLibraryDetails

export type CacheEntityFolderLike =
  | CacheEntityFolderRootDetails
  | CacheEntityFolderTrashDetails
  | CacheEntityFolderDetails
  | CacheEntityFolderItem
  | CacheEntityAppLibraryDetails
  | CacheEntityAppLibraryItem

export type CacheEntityAppLibrary =
  | CacheEntityAppLibraryItem
  | CacheEntityAppLibraryDetails

export type CacheEntity =
  | CacheEntityFolderLike
  | CacheEntityFile

export type CacheEntityWithParentId = Exclude<CacheEntity, CacheEntityFolderTrashDetails | CacheEntityFolderRootDetails>

export type ICloudDriveCacheEntityType = CacheEntity['type']

export interface CacheEntityFolderRootDetails {
  readonly type: 'ROOT'
  readonly hasDetails: true
  readonly content: T.DetailsDocwsRoot
  // readonly updated: Date
}

export class CacheEntityFolderRootDetails {
  readonly type = 'ROOT'
  readonly hasDetails = true
  // readonly updated: Date = new Date()
  constructor(
    public readonly content: T.DetailsDocwsRoot,
    public readonly created: Date = new Date(),
  ) {}
}

export class CacheEntityFolderTrashDetails {
  readonly type = 'TRASH_ROOT'
  readonly hasDetails = true
  constructor(
    public readonly content: T.DetailsTrash,
    public readonly created: Date = new Date(),
  ) {}
}

export class CacheEntityFolderDetails {
  readonly type = 'FOLDER'
  readonly hasDetails = true

  constructor(
    public readonly content: T.DetailsFolder,
    public readonly created: Date = new Date(),
  ) {}
}

export class CacheEntityFolderItem {
  readonly type = 'FOLDER'
  readonly hasDetails = false

  constructor(
    public readonly content: T.DriveChildrenItemFolder,
    public readonly created: Date = new Date(),
  ) {}
}

export class CacheEntityAppLibraryDetails {
  readonly type = 'APP_LIBRARY'
  readonly hasDetails = true

  constructor(
    public readonly content: T.DetailsAppLibrary,
    public readonly created: Date = new Date(),
  ) {}
}

export class CacheEntityAppLibraryItem {
  readonly type = 'APP_LIBRARY'
  readonly hasDetails = false

  constructor(
    public readonly content: T.DriveChildrenItemAppLibrary,
    public readonly created: Date = new Date(),
  ) {}
}

export class CacheEntityFile {
  readonly type = 'FILE'
  readonly hasDetails = false

  constructor(
    public readonly content: T.DriveChildrenItemFile,
    public readonly created: Date = new Date(),
  ) {}
}

export const hasParentId = (entity: CacheEntity): entity is CacheEntityWithParentId =>
  !isDocwsRootCacheEntity(entity) && !isTrashCacheEntity(entity)

export const isDocwsRootCacheEntity = (
  entity: CacheEntity,
): entity is CacheEntityFolderRootDetails => entity.type === 'ROOT'

export const isTrashCacheEntity = (
  entity: CacheEntity,
): entity is CacheEntityFolderTrashDetails => entity.type === 'TRASH_ROOT'

export const isFolderLikeCacheEntity = (
  entity: CacheEntity,
): entity is CacheEntityFolderLike => isFolderLikeType(entity.type)

export const isDetailsCacheEntity = (
  entity: CacheEntity,
): entity is CacheEntityFolderRootDetails | CacheEntityFolderDetails | CacheEntityAppLibraryDetails =>
  isFolderLikeCacheEntity(entity) && entity.hasDetails

export const isFolderLikeType = (
  type: CacheEntity['type'],
): type is (CacheEntityFolderLike | CacheEntityAppLibrary)['type'] => type !== 'FILE'
