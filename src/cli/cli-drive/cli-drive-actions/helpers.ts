import { string } from 'fp-ts'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import * as Eq from 'fp-ts/lib/Eq'
import { pipe } from 'fp-ts/lib/function'
import { groupBy } from 'fp-ts/lib/NonEmptyArray'
import * as Ord from 'fp-ts/lib/Ord'
import * as R from 'fp-ts/lib/Record'
import { isDeepStrictEqual } from 'util'
import * as C from '../../../icloud/drive/cache/cache'
import { isDetailsCacheEntity } from '../../../icloud/drive/cache/types'
import * as T from '../../../icloud/drive/requests/types/types'
import { rootDrivewsid, trashDrivewsid } from '../../../icloud/drive/requests/types/types-io'
import { err } from '../../../lib/errors'
import { logger } from '../../../lib/logging'
import { hasOwnProperties, Path } from '../../../lib/util'

export const compareHierarchies = (cached: T.Hierarchy, actual: T.Hierarchy) => {
  logger.debug(JSON.stringify({ cached, actual }))
  return {
    same: isDeepStrictEqual(cached, actual),
    path: hierarchyToPath(cached) !== hierarchyToPath(actual),
    pathByIds: !pipe(
      A.getEq(string.Eq).equals(
        cached.map(_ => _.drivewsid),
        actual.map(_ => _.drivewsid),
      ),
    ),
  }
}

export const compareHierarchiesItem = (
  cached: T.Hierarchy,
  actual: { hierarchy: T.Hierarchy; extension?: string; name: string; drivewsid: string; etag: string },
) => {
  return compareHierarchies(
    cached,
    [...actual.hierarchy, {
      drivewsid: actual.drivewsid,
      etag: actual.etag,
      name: actual.name,
      extension: actual.extension,
    }],
  )
}

export const compareByDrivewsid = <T extends { drivewsid: string; etag: string }>() =>
  Eq.contramap((a: T) => a.drivewsid)(string.Eq)

export const ordByDrivewsid = <T extends { drivewsid: string; etag: string }>() =>
  Ord.contramap((a: T) => a.drivewsid)(string.Ord)

export const compareDriveDetailsWithHierarchy = (
  cached: T.DriveDetailsWithHierarchy,
  actual: T.DriveDetailsWithHierarchy,
) => {
  const res = {
    etag: false,
    name: false,
    hierarchy: compareHierarchies(cached.hierarchy, actual.hierarchy),
    items: compareItems(cached.items, actual.items),
    oldPath: Path.join(hierarchyToPath(cached.hierarchy), T.fileName(cached)),
    newPath: Path.join(hierarchyToPath(actual.hierarchy), T.fileName(actual)),
  }

  if (hasOwnProperties(cached, 'etag', 'name') && hasOwnProperties(actual, 'etag', 'name')) {
    return {
      ...res,
      etag: cached.etag !== actual.etag,
      name: cached.name !== actual.name,
    }
  }

  return res
}

export const compareItemWithHierarchy = (
  cached: {
    etag: string
    name: string
    hierarchy: T.Hierarchy
    drivewsid: string
    extension?: string
  },
  actual: { etag: string; name: string; hierarchy: T.Hierarchy; drivewsid: string; extension?: string },
) => {
  return {
    etag: cached.etag !== actual.etag,
    name: cached.name !== actual.name,
    hierarchy: compareHierarchies(cached.hierarchy, actual.hierarchy),
    oldPath: Path.join(hierarchyToPath(cached.hierarchy), T.fileName(cached)),
    newPath: Path.join(hierarchyToPath(actual.hierarchy), T.fileName(actual)),
  }
}

export const getAppLibraries = (root: T.DetailsRoot) =>
  pipe(
    root.items,
    A.filter(T.isAppLibraryItem),
  )

export const groupByType = (items: T.DriveChildrenItem[]) =>
  pipe(
    items,
    A.partition(T.isFolderLikeItem),
    ({ left, right }) => ({
      folders: right,
      files: left as T.DriveChildrenItemFile[],
      items,
    }),
  )

export const compareItems = <T extends { drivewsid: string; etag: string }>(cached: T[], actual: T[]) => {
  return {
    same: isDeepStrictEqual(cached, actual),
    missing: pipe(
      A.difference(compareByDrivewsid<T>())(cached, actual),
    ),
    new: pipe(
      A.difference(compareByDrivewsid<T>())(actual, cached),
    ),
    etag: pipe(
      A.zip(
        A.sortBy([ordByDrivewsid<T>()])(A.intersection(compareByDrivewsid<T>())(cached, actual)),
        A.sortBy([ordByDrivewsid<T>()])(A.intersection(compareByDrivewsid<T>())(actual, cached)),
      ),
      A.filter(([a, b]) => a.etag !== b.etag),
    ),
  }
}

export const groupByTypeTuple = (items: [T.DriveChildrenItem, T.DriveChildrenItem][]) =>
  pipe(
    items,
    A.partition(([a, b]) => T.isFolderLikeItem(a)),
    ({ left, right }) => ({
      folders: right as [T.FolderLikeItem, T.FolderLikeItem][],
      files: left as [T.DriveChildrenItemFile, T.DriveChildrenItemFile][],
    }),
  )

export const compareDetails = (cached: T.DetailsRoot | T.DetailsRegular, actual: T.DetailsRoot | T.DetailsRegular) => {
  const items = compareItems(cached.items, actual.items)

  const cachedByZone = pipe(
    cached.items,
    groupBy(_ => _.zone),
  )

  const actualByZone = pipe(
    actual.items,
    groupBy(_ => _.zone),
  )

  const byZone = pipe(
    A.union(string.Eq)(R.keys(cachedByZone), R.keys(actualByZone)),
    A.reduce({}, (acc, key) => ({
      ...acc,
      [key]: compareItems(
        cachedByZone[key] ?? [],
        actualByZone[key] ?? [],
      ),
    })),
  )

  return {
    updated: pipe(
      items.etag,
      groupByTypeTuple,
    ),
    added: pipe(
      items.new,
      groupByType,
    ),
    missing: pipe(
      items.missing,
      groupByType,
    ),
    byZone,
  }
}

interface ParsedHierarchy {
  root: T.HierarchyRoot | T.HierarchyTrash
  path: T.HierarchyItem[]
}

export const parsedHierarchyToPath = ({ root, path }: ParsedHierarchy): NormalizedPath => {
  let result = T.isHierarchyItemRoot(root) ? '/' : 'TRASH_ROOT/'

  for (const e of path) {
    result += T.fileName(e) + '/'
  }

  return normalizePath(result)
}

/*

*/
export const hierarchyToPath = (hierarchy: T.Hierarchy): NormalizedPath => {
  return pipe(
    hierarchy,
    A.map(hitem =>
      T.isHierarchyItemRoot(hitem)
        ? '/'
        : T.isHierarchyItemTrash(hitem)
        ? 'TRASH_ROOT/'
        : T.fileName(hitem)
    ),
    _ => _.length > 0 ? _.join('/') : '/',
    normalizePath,
  )
}

declare const _brand: unique symbol

export interface Brand<B> {
  readonly [_brand]: B
}

export interface NormalizedPathBrand {
  readonly NormalizedPath: unique symbol
}

export interface NonRootDrivewsidBrand {
  readonly NonRootDrivewsid: unique symbol
}

export type Branded<A, B> = A & Brand<B>

/**
 * NormalizedPath has Path.normalize applied and no trailing slash
 */
export type NormalizedPath = Branded<string, NormalizedPathBrand>

// export type NonRootDrivewsid = Branded<string, NonRootDrivewsidBrand>

// export const isNonRootDrivewsid = (drivewsid: string): drivewsid is NonRootDrivewsid => {
//   return drivewsid !== rootDrivewsid && drivewsid !== trashDrivewsid
// }

const stripSlash = (s: string) => s == '/' ? s : s.replace(/\/$/, '')
const addSlash = (s: string) => s.startsWith('/') ? s : `/${s}`

/**
 * NormalizedPath has Path.normalize applied and no trailing slash
 */
export const normalizePath = (path: string): NormalizedPath => {
  return pipe(Path.normalize(path), stripSlash, addSlash) as NormalizedPath
}

export const itemWithHierarchyToPath = (item: T.HasName & { hierarchy: T.Hierarchy }) => {
  return pipe(
    hierarchyToPath(item.hierarchy),
    _ => Path.join(_, T.fileName(item)),
    normalizePath,
  )
}
