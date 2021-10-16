export const rootDrivewsid = 'FOLDER::com.apple.CloudDocs::root'

// type RecursiveTree = TreeNode

// export interface TreeFile {

// }

// export interface TreeFolder {
//   folder: DriveDetails
//   children: (TreeFolder | TreeFile)[]
// }

export type WithId = { drivewsid: string }

export type DriveDetails =
  | DriveDetailsFolder
  | DriveDetailsRoot
  | DriveDetailsAppLibrary

export type DriveChildrenItem =
  | DriveChildrenItemFile
  | DriveChildrenItemFolder
  | DriveChildrenItemAppLibrary

export const isRootDetails = (details: DriveDetails): details is DriveDetailsRoot =>
  details.name === '' && details.drivewsid === rootDrivewsid

export type DriveFolderLike =
  | DriveDetailsFolder
  | DriveDetailsAppLibrary
  | DriveDetailsRoot
  | DriveChildrenItemFolder
  | DriveChildrenItemAppLibrary

export const isFolderLike = (
  entity: DriveDetails | DriveChildrenItem,
): entity is DriveFolderLike => entity.type === 'APP_LIBRARY' || entity.type === 'FOLDER'

export const isFolderDetails = (
  entity: DriveDetails | DriveChildrenItem,
): entity is
  | DriveDetailsFolder
  | DriveDetailsAppLibrary
  | DriveDetailsRoot => entity.type === 'APP_LIBRARY' || entity.type === 'FOLDER'

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
