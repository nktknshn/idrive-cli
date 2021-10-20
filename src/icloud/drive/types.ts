import { pipe } from 'fp-ts/function'
import * as A from 'fp-ts/lib/Array'
import { hasOwnProperty, isObjectWithOwnProperty } from '../../lib/util'

export const rootDrivewsid = 'FOLDER::com.apple.CloudDocs::root'

export type RecursiveFolder =
  | {
    readonly details: DriveDetails
    readonly deep: true
    readonly children: RecursiveFolder[]
  }
  | {
    readonly details: DriveDetails
    readonly deep: false
  }

// export interface TreeFile {

// }

// export interface TreeFolder {
//   folder: DriveDetails
//   children: (TreeFolder | TreeFile)[]
// }

export type WithId = { drivewsid: string }

export type DriveDetails =
  | DriveDetailsRoot
  | DriveDetailsFolder
  | DriveDetailsAppLibrary

export type DriveChildrenItem =
  | DriveChildrenItemFile
  | DriveChildrenItemFolder
  | DriveChildrenItemAppLibrary

export const isRootDetails = (details: DriveDetails | DriveChildrenItem): details is DriveDetailsRoot =>
  details.name === '' && details.drivewsid === rootDrivewsid

export const isNotRootDetails = (details: DriveDetails | DriveChildrenItem): details is
  | DriveDetailsFolder
  | DriveDetailsAppLibrary => !isRootDetails(details)

export type DriveFolderLike =
  | DriveDetailsFolder
  | DriveDetailsAppLibrary
  | DriveDetailsRoot
  | DriveChildrenItemFolder
  | DriveChildrenItemAppLibrary

export const isFolderLike = (
  entity: DriveDetails | DriveChildrenItem,
): entity is DriveFolderLike => entity.type === 'APP_LIBRARY' || entity.type === 'FOLDER'

export const partitionFoldersFiles = (
  items: DriveChildrenItem[],
): {
  readonly left: (DriveChildrenItemFolder | DriveChildrenItemAppLibrary)[]
  readonly right: DriveChildrenItemFile[]
} =>
  pipe(items, A.partition(isFileItem), ({ left, right }) => ({
    left: left as (DriveChildrenItemFolder | DriveChildrenItemAppLibrary)[],
    right,
  }))

export const isFolderDetails = (
  entity: DriveDetails | DriveChildrenItem,
): entity is
  | DriveDetailsFolder
  | DriveDetailsAppLibrary
  | DriveDetailsRoot => isFolderLike(entity) && isObjectWithOwnProperty(entity, 'items')

export const isFileItem = (
  entity: DriveChildrenItem,
): entity is DriveChildrenItemFile => entity.type === 'FILE'

export const isFolderItem = (
  entity: DriveChildrenItem,
): entity is FolderItem => entity.type === 'APP_LIBRARY' || entity.type === 'FOLDER'

export type FolderItem =
  | DriveChildrenItemFolder
  | DriveChildrenItemAppLibrary

export const isFile = (
  entity: DriveDetails | DriveChildrenItem,
): entity is DriveChildrenItemFile => entity.type === 'FILE'

export interface DriveDetailsRoot {
  dateCreated: string
  drivewsid: typeof rootDrivewsid
  docwsid: string
  zone: string
  name: ''
  etag: string
  type: 'FOLDER'
  assetQuota: number
  fileCount: number
  shareCount: number
  shareAliasCount: number
  directChildrenCount: number
  items: DriveChildrenItem[]
  numberOfItems: number
  status: string
}

export type Hierarchy = (HierarchyItem | HierarchyItemRoot)[]

export interface DriveDetailsFolder {
  dateCreated: string
  drivewsid: string
  docwsid: string
  zone: string
  name: string
  etag: string
  type: 'FOLDER'
  assetQuota: number
  fileCount: number
  shareCount: number
  shareAliasCount: number
  directChildrenCount: number
  items: DriveChildrenItem[]
  numberOfItems: number
  status: string
  parentId: string
  hierarchy?: Hierarchy
  isChainedToParent?: boolean
  extension?: string
}

export interface DriveDetailsAppLibrary {
  dateCreated: string
  drivewsid: string
  docwsid: string
  zone: string
  name: string
  etag: string
  type: 'APP_LIBRARY'
  assetQuota: number
  fileCount: number
  shareCount: number
  shareAliasCount: number
  directChildrenCount: number
  items: DriveChildrenItem[]
  numberOfItems: number
  status: string
  parentId: string
  hierarchy?: Hierarchy
  isChainedToParent?: boolean
}

export interface DriveChildrenItemFolder {
  dateCreated: string
  drivewsid: string
  docwsid: string
  zone: string
  name: string
  parentId: string
  etag: string
  type: 'FOLDER'
  assetQuota: number
  fileCount: number
  shareCount: number
  shareAliasCount: number
  directChildrenCount: number
  isChainedToParent?: boolean
  extension?: string
}

export interface HierarchyItemRoot {
  drivewsid: typeof rootDrivewsid
}

export interface HierarchyItem {
  drivewsid: string
  name: string
  etag: string
}

export interface PartialItem {
  drivewsid: string
  docwsid: string
  etag: string
}

export interface DriveChildrenItemFile {
  dateCreated: string
  drivewsid: string
  docwsid: string
  zone: string
  name: string
  parentId: string
  dateModified: string
  dateChanged: string
  size: number
  etag: string
  shortGUID: string
  type: 'FILE'
  extension?: string
}

export interface DriveChildrenItemAppLibrary {
  dateCreated: string
  drivewsid: string
  docwsid: string
  zone: string
  name: string
  parentId: string
  etag: string
  type: 'APP_LIBRARY'
  maxDepth: string
  icons: Icon[]
  supportedExtensions: string[]
  supportedTypes: string[]
}

export interface Icon {
  url: string
  type: string
  size: number
}
