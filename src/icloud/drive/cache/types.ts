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

export type CacheEntityFolderLike =
  | CacheEntityFolderRootDetails
  | CacheEntityFolderDetails
  | CacheEntityFolderItem
  | CacheEntityAppLibraryDetails
  | CacheEntityAppLibraryItem

export type CacheEntityAppLibrary =
  | CacheEntityAppLibraryItem
  | CacheEntityAppLibraryDetails

export type ICloudDriveCacheEntity =
  | CacheEntityFolderLike
  | CacheEntityFile

export type ICloudDriveCacheEntityType = ICloudDriveCacheEntity['type']

interface CacheEntity {
  isFile(): this is CacheEntityFile
  isFolderLike(): this is CacheEntityFolderLike
}

export class CacheEntityFolderRootDetails implements CacheEntity {
  readonly type = 'ROOT'
  readonly hasDetails = true

  isFile(): this is CacheEntityFile {
    return false
  }

  isFolderLike(): this is CacheEntityFolderLike {
    return true
  }

  constructor(public readonly content: DriveDetailsRoot) {}
}

export class CacheEntityFolderDetails implements CacheEntity {
  readonly type = 'FOLDER'
  readonly hasDetails = true
  isFile(): this is CacheEntityFile {
    return false
  }

  isFolderLike(): this is CacheEntityFolderLike {
    return true
  }
  constructor(public readonly content: DriveDetailsFolder) {}
}

export class CacheEntityFolderItem implements CacheEntity {
  readonly type = 'FOLDER'
  readonly hasDetails = false
  isFile(): this is CacheEntityFile {
    return false
  }

  isFolderLike(): this is CacheEntityFolderLike {
    return true
  }
  constructor(public readonly content: DriveChildrenItemFolder) {}
}

export class CacheEntityAppLibraryDetails implements CacheEntity {
  readonly type = 'APP_LIBRARY'
  readonly hasDetails = true
  isFile(): this is CacheEntityFile {
    return false
  }

  isFolderLike(): this is CacheEntityFolderLike {
    return true
  }
  constructor(public readonly content: DriveDetailsAppLibrary) {}
}

export class CacheEntityAppLibraryItem implements CacheEntity {
  readonly type = 'APP_LIBRARY'
  readonly hasDetails = false
  isFile(): this is CacheEntityFile {
    return false
  }

  isFolderLike(): this is CacheEntityFolderLike {
    return true
  }
  constructor(public readonly content: DriveChildrenItemAppLibrary) {}
}

export class CacheEntityFile implements CacheEntity {
  readonly type = 'FILE'
  readonly hasDetails = false
  isFile(): this is CacheEntityFile {
    return true
  }

  isFolderLike(): this is CacheEntityFolderLike {
    return false
  }
  constructor(public readonly content: DriveChildrenItemFile) {}
}
