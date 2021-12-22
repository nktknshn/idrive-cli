/* eslint-disable @typescript-eslint/no-empty-interface */
import { pipe } from 'fp-ts/function'
import * as A from 'fp-ts/lib/Array'
import * as O from 'fp-ts/lib/Option'
import * as T from 'fp-ts/lib/Tree'
import { TypeOf } from 'io-ts'
import * as t from 'io-ts'
import { hasOwnProperty, isObjectWithOwnProperty } from '../../lib/util'
import * as types from './types-io'

export interface DetailsTrash extends TypeOf<typeof types.detailsTrash> {}

export interface DetailsRoot extends TypeOf<typeof types.detailsRoot> {}
export interface DetailsFolder extends TypeOf<typeof types.detailsFolder> {}
export interface DetailsAppLibrary extends TypeOf<typeof types.detailsAppLibrary> {}

export interface TrashItemFolder extends TypeOf<typeof types.trashItemFolder> {}
export interface TrashItemFile extends TypeOf<typeof types.trashItemFile> {}
export interface TrashItemAppLibrary extends TypeOf<typeof types.trashItemAppLibrary> {}

export type DriveChildrenTrashItem = TrashItemFolder | TrashItemFile | TrashItemAppLibrary

export type Root =
  | DetailsRoot
  | DetailsTrash
// | Details

export type Details =
  | DetailsTrash
  | DetailsRoot
  | RegularDetails

export type RegularDetails =
  | DetailsFolder
  | DetailsAppLibrary

export interface DriveChildrenItemFolder extends TypeOf<typeof types.itemFolder> {}
export interface DriveChildrenItemFile extends TypeOf<typeof types.itemFile> {}
export interface DriveChildrenItemAppLibrary extends TypeOf<typeof types.itemAppLibrary> {}

export type DriveChildrenItem = DriveChildrenItemFile | DriveChildrenItemFolder | DriveChildrenItemAppLibrary

export type DriveItemDetails = TypeOf<typeof types.itemDetails>

export interface Icon extends TypeOf<typeof types.icon> {}

export interface InvalidId extends TypeOf<typeof types.invalidIdItem> {}

export type MaybeNotFound<T> = InvalidId | T

export const isNotInvalidId = <T>(i: T | InvalidId): i is T => !types.invalidIdItem.is(i)
export const isInvalidId = <T>(i: T | InvalidId): i is InvalidId => types.invalidIdItem.is(i)

export const asOption = <T>(i: T | InvalidId): O.Option<T> => isInvalidId(i) ? O.none : O.some(i)

export type DriveDetailsWithHierarchy =
  | DriveDetailsRootWithHierarchy
  | DriveDetailsTrashWithHierarchy
  | DriveDetailsAppLibraryWithHierarchy
  | DriveDetailsFolderWithHierarchy

export type DriveDetailsWithHierarchyRegular =
  | DriveDetailsAppLibraryWithHierarchy
  | DriveDetailsFolderWithHierarchy

// TypeOf<typeof t.detailsWithHierarchy>

export type DriveDetailsPartialWithHierarchy = TypeOf<typeof types.driveDetailsWithHierarchyPartial>

export interface DriveDetailsRootWithHierarchy extends TypeOf<typeof types.rootDetailsWithHierarchy> {}
export interface DriveDetailsTrashWithHierarchy extends TypeOf<typeof types.trashDetailsWithHierarchy> {}

export interface DriveDetailsFolderWithHierarchy extends TypeOf<typeof types.folderDetailsWithHierarchy> {}
export interface DriveDetailsAppLibraryWithHierarchy extends TypeOf<typeof types.appLibraryDetailsWithHierarchy> {}
export interface DriveDetailsRootPartialWithHierarchy extends TypeOf<typeof types.rootDetailsWithHierarchyPartial> {}
export interface DriveDetailsTrashPartialWithHierarchy extends TypeOf<typeof types.trashDetailsWithHierarchyPartial> {}

export interface DriveDetailsFolderPartialWithHierarchy
  extends TypeOf<typeof types.folderDetailsWithHierarchyPartial>
{}

export interface DriveDetailsAppLibraryPartialWithHierarchy
  extends TypeOf<typeof types.appLibraryDetailsWithHierarchyPartial>
{}

// export interface DriveChildrenItem extends TypeOf<typeof t.childrenItem> {}

export type Hierarchy = TypeOf<typeof types.hierarchy>

export interface HierarchyItem extends TypeOf<typeof types.hierarchyItem> {}
export interface HierarchyRoot extends TypeOf<typeof types.hierarchyRoot> {}
export interface HierarchyTrash extends TypeOf<typeof types.hierarchyTrash> {}
export type HierarchyEntry = TypeOf<typeof types.hierarchyEntry>

export const isFileHierarchyEntry = (entry: HierarchyEntry) => entry.drivewsid.startsWith('FILE')
export const isFolderHierarchyEntry = (entry: HierarchyEntry) => entry.drivewsid.startsWith('FOLDER')

export const isFolderDrivewsid = (driwewsid: string) => driwewsid.startsWith('FOLDER')

export interface PartialItem extends TypeOf<typeof types.partialItem> {}

export type FolderTree = T.Tree<
  {
    readonly details: Details
    readonly deep: true
  } | {
    readonly details: Details
    readonly deep: false
  }
>

export type RecursiveFolder =
  | {
    readonly details: Details
    readonly deep: true
    readonly children: RecursiveFolder[]
  }
  | {
    readonly details: Details
    readonly deep: false
  }

export const invalidId: InvalidId = { status: 'ID_INVALID' as const }

export const isRegularDetails = (details: Details | DetailsTrash | DriveChildrenItem): details is
  | DetailsFolder
  | DetailsAppLibrary => !isCloudDocsRootDetails(details) && !isTrashDetails(details)

export const isCloudDocsRootDetails = (details: Details | DetailsTrash | DriveChildrenItem): details is DetailsRoot =>
  details.drivewsid === types.rootDrivewsid

export const isTrashDetails = (details: DetailsTrash | DetailsRoot | DriveChildrenItem): details is DetailsTrash =>
  details.drivewsid === types.trashDrivewsid

export const isTrashDetailsG = <T extends { drivewsid: string }>(details: DetailsTrash | T): details is DetailsTrash =>
  details.drivewsid === types.trashDrivewsid

export const isNotRootDetails = (details: Details | DriveChildrenItem): details is
  | DetailsFolder
  | DetailsAppLibrary => !isCloudDocsRootDetails(details) && !isTrashDetails(details)

export type DriveFolderLike =
  | DetailsFolder
  | DetailsAppLibrary
  | DetailsRoot
  | DetailsTrash
  | DriveChildrenItemFolder
  | DriveChildrenItemAppLibrary

export const isFolderLike = (
  entity: Details | DriveChildrenItem,
): entity is DriveFolderLike =>
  entity.drivewsid === types.trashDrivewsid
  || hasOwnProperty(entity, 'type') && entity.type === 'APP_LIBRARY'
  || hasOwnProperty(entity, 'type') && entity.type === 'FOLDER'

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

export const isDetails = (
  entity: Details | DriveChildrenItem,
): entity is Details => isTrashDetails(entity) || (isFolderLike(entity) && isObjectWithOwnProperty(entity, 'items'))

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
  entity: Details | DriveChildrenItem,
): entity is DriveChildrenItemFile => hasOwnProperty(entity, 'type') && entity.type === 'FILE'

export const isHierarchyItemRoot = (
  item: HierarchyItem | HierarchyRoot | HierarchyTrash,
): item is HierarchyRoot => item.drivewsid === types.rootDrivewsid

export const isHierarchyItemTrash = (
  item: HierarchyItem | HierarchyRoot | HierarchyTrash,
): item is HierarchyTrash => item.drivewsid === types.trashDrivewsid

export type HasName =
  // | {
  //   drivewsid: typeof types.trashDrivewsid
  // }
  // |
  { drivewsid: string; name: string; extension?: string }

export const hasName = <
  A extends HasName,
  B extends Record<string, unknown>,
>(a: A | B): a is A => {
  return t.intersection([
    t.type({ drivewsid: t.string, name: t.string }),
    t.partial({ extension: t.string }),
  ]).is(a)
}

export const fileName = (item: HasName | DetailsTrash) => {
  if (isTrashDetailsG(item)) {
    return 'TRASH'
  }

  return (item.drivewsid === types.rootDrivewsid)
    ? '/'
    : item.extension
    ? `${item.name}${item.extension.length > 0 ? `.${item.extension}` : ''}`
    : `${item.name}`
}

export const itemType = (item: { type: string } | DetailsTrash) => {
  if ('type' in item) {
    return item.type
  }

  return 'TRASH_ROOT'
}

// export const itemType = (item: HasName) =>
// hasOwnProperty(item, 'drivewsid') && item.drivewsid === types.trashDrivewsid
//   ? 'Trash'
//   : hasOwnProperty(item, 'drivewsid') && (item.drivewsid === types.rootDrivewsid)
//   ? '/'
//   : item.extension
//   ? `${item.name}${item.extension.length > 0 ? `.${item.extension}` : ''}`
//   : `${item.name}`
