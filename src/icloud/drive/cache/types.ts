import * as O from 'fp-ts/lib/Option'
import {
  DriveChildrenItemAppLibrary,
  DriveChildrenItemFile,
  DriveChildrenItemFolder,
  DriveDetailsAppLibrary,
  DriveDetailsFolder,
  DriveDetailsRoot,
} from '../types'

export interface ICloudDriveCache {
  readonly byDrivewsid: { readonly [drivewsid: string]: ICloudDriveCacheEntity }
  // readonly byPath: { readonly [path: string]: ICloudDriveCacheEntity }
  // readonly root: O.Option<DriveDetailsRoot>
}

export type CacheEntityFolder =
  | CacheEntityFolderRootDetails
  | CacheEntityFolderDetails
  | CacheEntityFolderItem
  | CacheEntityAppLibraryDetails
  | CacheEntityAppLibraryItem

export type CacheEntityAppLibrary =
  | CacheEntityAppLibraryItem
  | CacheEntityAppLibraryDetails

export type ICloudDriveCacheEntity =
  | CacheEntityFolder
  | CacheEntityFile

export type ICloudDriveCacheEntityType = ICloudDriveCacheEntity['type']

export class CacheEntityFolderRootDetails {
  readonly type = 'ROOT'
  readonly hasDetails = true

  constructor(public readonly content: DriveDetailsRoot) {}
}

export class CacheEntityFolderDetails {
  readonly type = 'FOLDER'
  readonly hasDetails = true

  constructor(public readonly content: DriveDetailsFolder) {}
}

export class CacheEntityFolderItem {
  readonly type = 'FOLDER'
  readonly hasDetails = false

  constructor(public readonly content: DriveChildrenItemFolder) {}
}

export class CacheEntityAppLibraryDetails {
  readonly type = 'APP_LIBRARY'
  readonly hasDetails = true

  constructor(public readonly content: DriveDetailsAppLibrary) {}
}

export class CacheEntityAppLibraryItem {
  readonly type = 'APP_LIBRARY'
  readonly hasDetails = false

  constructor(public readonly content: DriveChildrenItemAppLibrary) {}
}

export class CacheEntityFile {
  readonly type = 'FILE'
  readonly hasDetails = false

  constructor(public readonly content: DriveChildrenItemFile) {}
}
