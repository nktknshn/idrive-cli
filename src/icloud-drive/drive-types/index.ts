/* eslint-disable @typescript-eslint/no-empty-object-type */
import * as Ord from 'fp-ts/lib/Ord'

import { boolean, number, string } from 'fp-ts'
import * as O from 'fp-ts/lib/Option'
import * as t from 'io-ts'
import { TypeOf } from 'io-ts'

import { hasOwnProperty, isObjectWithOwnProperty } from '../../util/util'
import * as types from './types-io'
export * as TypesIo from './types-io'

export type DetailsOrFile<R extends Details> = (R | NonRootDetails | DriveChildrenItemFile)

export type NonRootDrivewsid = t.TypeOf<typeof types.nonRootDrivewsid>

export interface DetailsTrashRoot extends TypeOf<typeof types.detailsTrash> {}

export interface DetailsDocwsRoot extends TypeOf<typeof types.detailsRoot> {}

/**  Extends DriveChildrenItemFolder with `{ items: DriveChildrenItem[] }` */
export interface DetailsFolder extends TypeOf<typeof types.detailsFolder> {}

/**  Extends DriveChildrenItemAppLibrary with `{ items: DriveChildrenItem[] }` */
export interface DetailsAppLibrary extends TypeOf<typeof types.detailsAppLibrary> {}

export interface TrashItemFolder extends TypeOf<typeof types.trashItemFolder> {}
export interface TrashItemFile extends TypeOf<typeof types.trashItemFile> {}
export interface TrashItemAppLibrary extends TypeOf<typeof types.trashItemAppLibrary> {}

export type DriveChildrenTrashItem = TrashItemFolder | TrashItemFile | TrashItemAppLibrary

export type Root =
  | DetailsDocwsRoot
  | DetailsTrashRoot

export type Details =
  | Root
  | NonRootDetails

export type DetailsOrRoot<R extends Details> =
  | R
  | NonRootDetails

/** Details of a folder that is not a root */
export type NonRootDetails =
  | DetailsFolder
  | DetailsAppLibrary

export interface DriveChildrenItemFolder extends TypeOf<typeof types.itemFolder> {}
export interface DriveChildrenItemFile extends TypeOf<typeof types.itemFile> {}
export interface DriveChildrenItemAppLibrary extends TypeOf<typeof types.itemAppLibrary> {}

export type DriveChildrenItem = DriveChildrenItemFile | DriveChildrenItemFolder | DriveChildrenItemAppLibrary

export type DriveItemDetails = TypeOf<typeof types.itemDetails>

export interface Icon extends TypeOf<typeof types.icon> {}

export interface InvalidId extends TypeOf<typeof types.invalidIdItem> {}

export type MaybeInvalidId<T> = InvalidId | T

export const isNotInvalidId = <T>(i: T | InvalidId): i is T => !types.invalidIdItem.is(i)
export const isInvalidId = <T>(i: T | InvalidId): i is InvalidId => types.invalidIdItem.is(i)

export const invalidIdToOption = <T>(i: T | InvalidId): O.Option<T> => isInvalidId(i) ? O.none : O.some(i)

export type DriveDetailsWithHierarchy =
  | DriveDetailsRootWithHierarchy
  | DriveDetailsTrashWithHierarchy
  | DriveDetailsAppLibraryWithHierarchy
  | DriveDetailsFolderWithHierarchy

export type DriveDetailsWithHierarchyRegular =
  | DriveDetailsAppLibraryWithHierarchy
  | DriveDetailsFolderWithHierarchy

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

export type Hierarchy = TypeOf<typeof types.hierarchy>

export interface HierarchyItem extends TypeOf<typeof types.hierarchyItem> {}
export interface HierarchyRoot extends TypeOf<typeof types.hierarchyRoot> {}
export interface HierarchyTrash extends TypeOf<typeof types.hierarchyTrash> {}
export type HierarchyEntry = TypeOf<typeof types.hierarchyEntry>

export const isFileHierarchyEntry = (entry: HierarchyEntry): boolean => entry.drivewsid.startsWith('FILE')
export const isFolderHierarchyEntry = (entry: HierarchyEntry): boolean => entry.drivewsid.startsWith('FOLDER')

export const isFolderDrivewsid = (driwewsid: string): boolean => driwewsid.startsWith('FOLDER')

export interface PartialItem extends TypeOf<typeof types.partialItem> {}

export const invalidId: InvalidId = { status: 'ID_INVALID' as const }

/** `details` is not root or trash and not an item of details */
export const isRegularDetails = (details: Details | DetailsTrashRoot | DriveChildrenItem): details is
  | DetailsFolder
  | DetailsAppLibrary => !isCloudDocsRootDetails(details) && !isTrashDetails(details) && isFolderLike(details)

/** `details` is a docws root */
export const isCloudDocsRootDetails = (
  details: Details | DriveChildrenItem,
): details is DetailsDocwsRoot => details.drivewsid === types.rootDrivewsid

export const isCloudDocsRootDetailsG = <T extends { drivewsid: string }>(
  details: DetailsDocwsRoot | T,
): details is DetailsDocwsRoot => details.drivewsid === types.rootDrivewsid

export const isTrashDetails = (
  details: Details | DriveChildrenItem,
): details is DetailsTrashRoot => details.drivewsid === types.trashDrivewsid

/** Generic version of `isTrashDetails` preserving the type */
export const isTrashDetailsG = <T extends { drivewsid: string }>(
  details: DetailsTrashRoot | T,
): details is DetailsTrashRoot => details.drivewsid === types.trashDrivewsid

export const isNotRootDetails = (
  details: Root | Details | DetailsTrashRoot | FolderLikeItem | DriveChildrenItemFile,
): details is NonRootDetails | FolderLikeItem | DriveChildrenItemFile =>
  !isCloudDocsRootDetails(details) && !isTrashDetails(details)

export const isNotFile = <A extends { drivewsid: string }>(d: A | DriveChildrenItemFile): d is A =>
  !(isObjectWithOwnProperty(d, 'type') && d.type === 'FILE')

export type FolderLike =
  | DetailsFolder
  | DetailsAppLibrary
  | DetailsDocwsRoot
  | DetailsTrashRoot
  | DriveChildrenItemFolder
  | DriveChildrenItemAppLibrary

export const isFolderLike = <R extends Root>(
  entity: DetailsOrRoot<R> | DriveChildrenItem,
): entity is DetailsFolder | DetailsAppLibrary | R => !(hasOwnProperty(entity, 'type') && entity.type === 'FILE')

export const isDetails = (
  entity: Details | DriveChildrenItem,
): entity is Details => isTrashDetails(entity) || (isFolderLike(entity) && isObjectWithOwnProperty(entity, 'items'))

export const isDetailsG = <R extends Root>(
  entity: DetailsOrFile<R>,
): entity is R | NonRootDetails =>
  isTrashDetails(entity) || (isFolderLike(entity) && isObjectWithOwnProperty(entity, 'items'))

export const isFileItem = (
  entity: DriveChildrenItem,
): entity is DriveChildrenItemFile => entity.type === 'FILE'

export const isFolderLikeItem = (
  entity: DriveChildrenItem,
): entity is FolderLikeItem => entity.type === 'APP_LIBRARY' || entity.type === 'FOLDER'

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

export type HasName = { drivewsid: string; name: string; extension?: string }

export const hasName = <
  A extends HasName,
  B extends Record<string, unknown>,
>(a: A | B): a is A => {
  return t.intersection([
    t.type({ drivewsid: t.string, name: t.string }),
    t.partial({ extension: t.string }),
  ]).is(a)
}

export const fileName = (item: HasName | DetailsTrashRoot): string => {
  if (isTrashDetailsG(item)) {
    return 'TRASH_ROOT'
  }

  return (item.drivewsid === types.rootDrivewsid)
    ? '/'
    : item.extension
    ? `${item.name}${item.extension.length > 0 ? `.${item.extension}` : ''}`
    : `${item.name}`
}

export const fileNameAddSlash = (item: HasName | DetailsTrashRoot): string => {
  const fname = fileName(item)

  if (isFolderDrivewsid(item.drivewsid) && item.drivewsid !== types.rootDrivewsid) {
    return `${fname}/`
  }

  return fname
}

export const ordIsFolder = Ord.contramap(isFolderLike)(boolean.Ord)

export const ordDriveChildrenItemByType = Ord.contramap((d: DriveChildrenItem) => d.type)(string.Ord)
export const ordDriveChildrenItemByName = Ord.contramap((d: DriveChildrenItem) => d.name)(string.Ord)

export const ordDriveChildrenItemBySize = Ord.contramap((d: DriveChildrenItem) => isFileItem(d) ? d.size : 0)(
  Ord.reverse(number.Ord),
)
