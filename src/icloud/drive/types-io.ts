import * as t from 'io-ts'
import { omit } from './omit'

export const rootDrivewsid = 'FOLDER::com.apple.CloudDocs::root'
export const cloudDocsZone = 'com.apple.CloudDocs'
export const trashDrivewsid = 'TRASH_ROOT'

export const genericItem = t.intersection([
  t.type({
    dateCreated: t.string,
    drivewsid: t.string,
    docwsid: t.string,
    zone: t.string,
    name: t.string,
    etag: t.string,
  }),
  t.partial({
    extension: t.string,
    restorePath: t.string,
  }),
])

export const itemFolder = t.intersection([
  genericItem,
  t.type({
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
  genericItem,
  t.intersection([
    t.type({
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
  genericItem,
  t.type({
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

export const hierarchyItemRoot = t.type({
  drivewsid: t.literal(rootDrivewsid),
})

export const hierarchyItemTrash = t.type({
  drivewsid: t.literal(trashDrivewsid),
})

export const hierarchy = t.array(
  t.union([
    hierarchyItemRoot,
    hierarchyItemTrash,
    hierarchyItem,
  ]),
)

export const detailsItem = t.union([
  itemFolder,
  itemFile,
  itemAppLibrary,
])

export const detailsRoot = t.intersection([
  omit('parentId', itemFolder),
  t.type({
    drivewsid: t.literal(rootDrivewsid),
    name: t.literal(''),
    numberOfItems: t.number,
    status: t.literal('OK'),
    items: t.array(detailsItem),
  }),
  // t.partial({
  //   hierarchy,
  // }),
])

export const detailsFolder = t.intersection([
  itemFolder,
  t.type({
    numberOfItems: t.number,
    status: t.literal('OK'),
    items: t.array(detailsItem),
  }),
  // t.partial({
  //   hierarchy,
  // }),
])

export const detailsAppLibrary = t.intersection([
  itemAppLibrary,
  t.type({
    numberOfItems: t.number,
    status: t.literal('OK'),
    items: t.array(detailsItem),
  }),
  // t.partial({
  //   hierarchy,
  // }),
])

export const driveDetails = t.union([
  detailsRoot,
  detailsFolder,
  detailsAppLibrary,
])

export const invalidIdItem = t.type({ status: t.literal('ID_INVALID') })

export const itemDetails = t.union([
  t.intersection([itemFolder, t.type({ hierarchy })]),
  t.intersection([itemFile, t.type({ hierarchy })]),
  t.intersection([itemAppLibrary, t.type({ hierarchy })]),
  //   invalidIdItem,
])

export const rootDetailsWithHierarchy = t.intersection([detailsRoot, t.type({ hierarchy })])
export const folderDetailsWithHierarchy = t.intersection([detailsFolder, t.type({ hierarchy })])
export const appLibraryDetailsWithHierarchy = t.intersection([detailsAppLibrary, t.type({ hierarchy })])

export const detailsWithHierarchy = t.union([
  rootDetailsWithHierarchy,
  folderDetailsWithHierarchy,
  appLibraryDetailsWithHierarchy,
])

export const partialItem = t.type({
  drivewsid: t.string,
  docwsid: t.string,
  etag: t.string,
})

export const rootDetailsWithHierarchyPartial = t.intersection([
  omit('items', rootDetailsWithHierarchy),
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

// export const rootDetailsWithHierarchyPartial = t.intersection([
//   itemFolder,
//   t.type({
//     drivewsid: t.literal(rootDrivewsid),
//     name: t.literal(''),
//     numberOfItems: t.number,
//     status: t.literal('OK'),
//     items: t.array(detailsItem),
//   }),
//   t.partial({
//     hierarchy,
//   }),
//   t.type({ items: t.array(partialItem) }),
// ])

// export const folderDetailsWithHierarchyPartial = t.intersection([
//   itemFolder,
//   t.type({
//     numberOfItems: t.number,
//     status: t.literal('OK'),
//     hierarchy,
//   }),
//   t.type({ items: t.array(partialItem) }),
// ])

// export const appLibraryDetailsWithHierarchyPartial = t.intersection([
//   itemAppLibrary,
//   t.type({
//     numberOfItems: t.number,
//     status: t.literal('OK'),
//     hierarchy,
//   }),
//   t.type({ items: t.array(partialItem) }),
// ])

export const driveDetailsWithHierarchyPartial = t.union([
  rootDetailsWithHierarchyPartial,
  folderDetailsWithHierarchyPartial,
  appLibraryDetailsWithHierarchyPartial,
])
