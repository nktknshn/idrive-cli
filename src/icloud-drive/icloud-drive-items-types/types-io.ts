import * as t from 'io-ts'
import { omit } from '../../util/io-omit'

export const rootDrivewsid = 'FOLDER::com.apple.CloudDocs::root'
export const cloudDocsZone = 'com.apple.CloudDocs'
export const trashDrivewsid = 'TRASH_ROOT'

interface NonRootDrivewsidBrand {
  readonly NonRootDrivewsid: unique symbol
}

export const nonRootDrivewsid = t.brand(
  t.string,
  (drivewsid: string): drivewsid is t.Branded<string, NonRootDrivewsidBrand> => {
    return drivewsid !== rootDrivewsid && drivewsid !== trashDrivewsid
  },
  'NonRootDrivewsid',
)

export const commonProperties = t.intersection([
  t.type({
    dateCreated: t.string,
    docwsid: t.string,
    zone: t.string,
    name: t.string,
    etag: t.string,
  }),
  t.partial({
    extension: t.string,
    status: t.literal('OK'),
    restorePath: t.string,
  }),
])

export const itemDocwsRoot = t.intersection([
  commonProperties,
  t.type({
    drivewsid: t.literal(rootDrivewsid),
  }),
])

export const itemFolder = t.intersection([
  commonProperties,
  t.type({
    drivewsid: nonRootDrivewsid,
    parentId: t.string,
    type: t.literal('FOLDER'),
    assetQuota: t.number,
    fileCount: t.number,
    shareCount: t.number,
    shareAliasCount: t.number,
    directChildrenCount: t.number,
  }),
  t.partial({
    isChainedToParent: t.boolean,
  }),
])

export const itemFile = t.intersection([
  commonProperties,
  t.intersection([
    t.type({
      drivewsid: nonRootDrivewsid,
      parentId: t.string,
      type: t.literal('FILE'),
      size: t.number,
      dateModified: t.string,
      dateChanged: t.string,
    }),
    t.partial({
      shortGUID: t.string,
      lastOpenTime: t.string,
    }),
  ]),
])

export const icon = t.type({ url: t.string, type: t.string, size: t.number })

export const itemAppLibrary = t.intersection([
  commonProperties,
  t.type({
    drivewsid: nonRootDrivewsid,
    parentId: t.string,
    type: t.literal('APP_LIBRARY'),
    maxDepth: t.string,
    icons: t.array(icon),
    supportedExtensions: t.array(t.string),
    supportedTypes: t.array(t.string),
  }),
])

export const childrenItem = t.union([
  itemAppLibrary,
  itemFile,
  itemFolder,
])

export const hierarchyItem = t.intersection([
  t.type({
    drivewsid: t.string,
    name: t.string,
    etag: t.string,
  }),
  t.partial({
    extension: t.string,
  }),
])

export const hierarchyRoot = t.type({
  drivewsid: t.literal(rootDrivewsid),
})

export const hierarchyTrash = t.type({
  drivewsid: t.literal(trashDrivewsid),
})

export const hierarchyEntry = t.union([
  hierarchyRoot,
  hierarchyTrash,
  hierarchyItem,
])

export const hierarchy = t.array(hierarchyEntry)

export const detailsItem = t.union([
  itemFolder,
  itemFile,
  itemAppLibrary,
])

export const detailsRoot = t.intersection([
  omit('drivewsid', omit('parentId', itemFolder)),
  t.type({
    drivewsid: t.literal(rootDrivewsid),
    name: t.literal(''),
    numberOfItems: t.number,
    status: t.literal('OK'),
    items: t.array(detailsItem),
  }),
])

export const detailsFolder = t.intersection([
  itemFolder,
  t.type({
    numberOfItems: t.number,
    status: t.literal('OK'),
    items: t.array(detailsItem),
  }),
])

export const detailsAppLibrary = t.intersection([
  itemAppLibrary,
  t.type({
    numberOfItems: t.number,
    status: t.literal('OK'),
    items: t.array(detailsItem),
  }),
])

export const invalidIdItem = t.type({ status: t.literal('ID_INVALID') })

// itemDetails

export const itemDetails = t.union([
  t.intersection([itemFolder, t.type({ hierarchy })]),
  t.intersection([itemFile, t.type({ hierarchy })]),
  t.intersection([itemAppLibrary, t.type({ hierarchy })]),
  t.intersection([itemDocwsRoot, t.type({ hierarchy })]),
  //   invalidIdItem,
])

export const trashItemFolder = t.intersection([itemFolder, t.partial({ 'restorePath': t.string })])
export const trashItemFile = t.intersection([itemFile, t.partial({ 'restorePath': t.string })])
export const trashItemAppLibrary = t.intersection([itemAppLibrary, t.partial({ 'restorePath': t.string })])

export const trashItem = t.union([
  trashItemFolder,
  trashItemAppLibrary,
  trashItemFile,
])

export const detailsTrash = t.type({
  items: t.array(trashItem),
  numberOfItems: t.number,
  drivewsid: t.literal(trashDrivewsid),
})

export const rootDetailsWithHierarchy = t.intersection([detailsRoot, t.type({ hierarchy })])
export const trashDetailsWithHierarchy = t.intersection([detailsTrash, t.type({ hierarchy })])
export const folderDetailsWithHierarchy = t.intersection([detailsFolder, t.type({ hierarchy })])
export const appLibraryDetailsWithHierarchy = t.intersection([detailsAppLibrary, t.type({ hierarchy })])

export const detailsWithHierarchy = t.union([
  rootDetailsWithHierarchy,
  folderDetailsWithHierarchy,
  appLibraryDetailsWithHierarchy,
  trashDetailsWithHierarchy,
])

// dateExpiration

export const partialItem = t.type({
  drivewsid: t.string,
  docwsid: t.string,
  etag: t.string,
})

export const rootDetailsWithHierarchyPartial = t.intersection([
  omit('items', rootDetailsWithHierarchy),
  t.type({ items: t.array(partialItem) }),
])

export const trashDetailsWithHierarchyPartial = t.intersection([
  omit('items', trashDetailsWithHierarchy),
  t.type({ items: t.array(partialItem) }),
])

export const folderDetailsWithHierarchyPartial = t.intersection([
  omit('items', folderDetailsWithHierarchy),
  t.type({ items: t.array(partialItem) }),
])

export const appLibraryDetailsWithHierarchyPartial = t.intersection([
  omit('items', appLibraryDetailsWithHierarchy),
  t.type({ items: t.array(partialItem) }),
])

export const driveDetailsWithHierarchyPartial = t.union([
  rootDetailsWithHierarchyPartial,
  trashDetailsWithHierarchyPartial,
  folderDetailsWithHierarchyPartial,
  appLibraryDetailsWithHierarchyPartial,
])

export const driveDetails = t.union([
  detailsRoot,
  detailsFolder,
  detailsAppLibrary,
  detailsTrash,
])
