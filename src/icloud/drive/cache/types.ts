import * as O from 'fp-ts/lib/Option'
import {
  DetailsAppLibrary,
  DetailsFolder,
  DetailsRoot,
  DriveChildrenItemAppLibrary,
  DriveChildrenItemFile,
  DriveChildrenItemFolder,
} from '../types'

export interface CacheF {
  readonly byDrivewsid: { readonly [drivewsid: string]: CacheEntity }
  // readonly byPath: { readonly [path: string]: ICloudDriveCacheEntity }
  // readonly root: O.Option<DriveDetailsRoot>
}

export type CacheEntityDetails =
  | CacheEntityFolderRootDetails
  | CacheEntityFolderDetails
  | CacheEntityAppLibraryDetails

export type CacheEntityFolderLike =
  | CacheEntityFolderRootDetails
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

export type ICloudDriveCacheEntityType = CacheEntity['type']

// interface CacheEntityC {
//   isFile(): this is CacheEntityFile
//   isFolderLike(): this is CacheEntityFolderLike
// }

export class CacheEntityFolderRootDetails {
  readonly type = 'ROOT'
  readonly hasDetails = true
  constructor(public readonly content: DetailsRoot) {}
}

export class CacheEntityFolderDetails {
  readonly type = 'FOLDER'
  readonly hasDetails = true

  constructor(public readonly content: DetailsFolder) {}
}

export class CacheEntityFolderItem {
  readonly type = 'FOLDER'
  readonly hasDetails = false

  constructor(public readonly content: DriveChildrenItemFolder) {}
}

export class CacheEntityAppLibraryDetails {
  readonly type = 'APP_LIBRARY'
  readonly hasDetails = true

  constructor(public readonly content: DetailsAppLibrary) {}
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
