import * as CT from '../../icloud-drive-items-types'

/** Cache is just a key-val storage for files info */
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
  | CacheEntityAppLibraryDetails

export type CacheEntityAppLibrary = // | CacheEntityAppLibraryItem
  CacheEntityAppLibraryDetails

export type CacheEntity = CacheEntityFolderLike
// | CacheEntityFile

export type CacheEntityWithParentId = Exclude<CacheEntity, CacheEntityFolderTrashDetails | CacheEntityFolderRootDetails>

export type ICloudDriveCacheEntityType = CacheEntity['type']

export interface CacheEntityFolderRootDetails {
  readonly type: 'ROOT'
  readonly hasDetails: true
  readonly content: CT.DetailsDocwsRoot
}

export class CacheEntityFolderRootDetails {
  readonly type = 'ROOT'
  readonly hasDetails = true
  constructor(
    public readonly content: CT.DetailsDocwsRoot,
    public readonly created: Date = new Date(),
  ) {}
}

export class CacheEntityFolderTrashDetails {
  readonly type = 'TRASH_ROOT'
  readonly hasDetails = true
  constructor(
    public readonly content: CT.DetailsTrashRoot,
    public readonly created: Date = new Date(),
  ) {}
}

export class CacheEntityFolderDetails {
  readonly type = 'FOLDER'
  readonly hasDetails = true

  constructor(
    public readonly content: CT.DetailsFolder,
    public readonly created: Date = new Date(),
  ) {}
}

export class CacheEntityAppLibraryDetails {
  readonly type = 'APP_LIBRARY'
  readonly hasDetails = true

  constructor(
    public readonly content: CT.DetailsAppLibrary,
    public readonly created: Date = new Date(),
  ) {}
}

export class CacheEntityFile {
  readonly type = 'FILE'
  readonly hasDetails = false

  constructor(
    public readonly content: CT.DriveChildrenItemFile,
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
): entity is CacheEntityFolderLike => isFolderLikeCacheEntity(entity) && entity.hasDetails

export const isFolderLikeType = (
  type: CacheEntity['type'],
): type is (CacheEntityFolderLike | CacheEntityAppLibrary)['type'] => true
