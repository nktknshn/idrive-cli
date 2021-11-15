/* eslint-disable @typescript-eslint/no-empty-interface */
import { pipe } from 'fp-ts/function'
import * as A from 'fp-ts/lib/Array'
import * as O from 'fp-ts/lib/Option'
import * as T from 'fp-ts/lib/Tree'
import { TypeOf } from 'io-ts'
import { hasOwnProperty, isObjectWithOwnProperty } from '../../lib/util'
import * as t from './types-io'

export const rootDrivewsid = 'FOLDER::com.apple.CloudDocs::root'
export const cloudDocsZone = 'com.apple.CloudDocs'
export const trashDrivewsid = 'TRASH_ROOT'

export interface DriveDetailsRoot extends TypeOf<typeof t.detailsRoot> {}
export interface DriveDetailsFolder extends TypeOf<typeof t.detailsFolder> {}
export interface DriveDetailsAppLibrary extends TypeOf<typeof t.detailsAppLibrary> {}
export interface DriveChildrenItemFolder extends TypeOf<typeof t.itemFolder> {}
export interface DriveChildrenItemFile extends TypeOf<typeof t.itemFile> {}
export interface DriveChildrenItemAppLibrary extends TypeOf<typeof t.itemAppLibrary> {}
export type DriveItemDetails = TypeOf<typeof t.itemDetails>

export interface Icon extends TypeOf<typeof t.icon> {}

export interface InvalidId extends TypeOf<typeof t.invalidIdItem> {}

export interface ItemNotFound {
  readonly tag: 'ItemNotFound'
  drivewsid: string
}

export type MaybeNotFound<T> = InvalidId | T

export const isNotInvalidId = <T>(i: T | InvalidId): i is T => !t.invalidIdItem.is(i)
export const isInvalidId = <T>(i: T | InvalidId): i is InvalidId => !t.invalidIdItem.is(i)

export const asOption = <T>(i: T | InvalidId): O.Option<T> => isInvalidId(i) ? O.none : O.some(i)

export type DriveDetailsWithHierarchy = TypeOf<typeof t.detailsWithHierarchy>

export type DriveDetailsPartialWithHierarchy = TypeOf<typeof t.driveDetailsWithHierarchyPartial>

export interface DriveDetailsRootWithHierarchy extends TypeOf<typeof t.rootDetailsWithHierarchy> {}

export interface DriveDetailsFolderWithHierarchy extends TypeOf<typeof t.folderDetailsWithHierarchy> {}
export interface DriveDetailsAppLibraryWithHierarchy extends TypeOf<typeof t.appLibraryDetailsWithHierarchy> {}
export interface DriveDetailsRootPartialWithHierarchy extends TypeOf<typeof t.rootDetailsWithHierarchyPartial> {}

export interface DriveDetailsFolderPartialWithHierarchy extends TypeOf<typeof t.folderDetailsWithHierarchyPartial> {}

export interface DriveDetailsAppLibraryPartialWithHierarchy
  extends TypeOf<typeof t.appLibraryDetailsWithHierarchyPartial>
{}

export type Hierarchy = TypeOf<typeof t.hierarchy>

export interface HierarchyItemRoot extends TypeOf<typeof t.hierarchyItemRoot> {}
export interface HierarchyItem extends TypeOf<typeof t.hierarchyItem> {}
export interface HierarchyItemTrash extends TypeOf<typeof t.hierarchyItemTrash> {}

export interface PartialItem extends TypeOf<typeof t.partialItem> {}

export type FolderTree = T.Tree<
  {
    readonly details: DriveDetails
    readonly deep: true
  } | {
    readonly details: DriveDetails
    readonly deep: false
  }
>

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

export type DriveDetails =
  | DriveDetailsRoot
  | DriveDetailsFolder
  | DriveDetailsAppLibrary

export type DriveChildrenItem =
  | DriveChildrenItemFile
  | DriveChildrenItemFolder
  | DriveChildrenItemAppLibrary

export type DriveObject = {
  name: string
  extension?: string
  drivewsid: string
}

export const invalidId: InvalidId = { status: 'ID_INVALID' as const }

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

export const isFolderLikeItem = (
  entity: DriveChildrenItem,
): entity is FolderLikeItem => entity.type === 'APP_LIBRARY' || entity.type === 'FOLDER'

// export const isFolderLikeItem = (
//   entity: DriveChildrenItem,
// ): entity is FolderLikeItem => entity.type === 'APP_LIBRARY' || entity.type === 'FOLDER'

export const isAppLibraryItem = (
  entity: DriveChildrenItem,
): entity is DriveChildrenItemAppLibrary => entity.type === 'APP_LIBRARY'

export const isNotAppLibraryItem = (
  entity: DriveChildrenItem,
): entity is
  | DriveChildrenItemFile
  | DriveChildrenItemFolder => entity.type !== 'APP_LIBRARY'

export type FolderLikeItem =
  | DriveChildrenItemFolder
  | DriveChildrenItemAppLibrary

export const isFile = (
  entity: DriveDetails | DriveChildrenItem,
): entity is DriveChildrenItemFile => entity.type === 'FILE'

export const isHierarchyItemRoot = (
  item: HierarchyItem | HierarchyItemRoot | HierarchyItemTrash,
): item is HierarchyItemRoot => item.drivewsid === rootDrivewsid

export const isHierarchyItemTrash = (
  item: HierarchyItem | HierarchyItemRoot | HierarchyItemTrash,
): item is HierarchyItemTrash => item.drivewsid === trashDrivewsid