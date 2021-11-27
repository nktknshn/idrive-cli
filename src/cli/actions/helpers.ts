import { string } from 'fp-ts'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import * as Eq from 'fp-ts/lib/Eq'
import { pipe } from 'fp-ts/lib/function'
import { groupBy } from 'fp-ts/lib/NonEmptyArray'
import * as Ord from 'fp-ts/lib/Ord'
import * as R from 'fp-ts/lib/Record'
import path from 'path'
import { isDeepStrictEqual } from 'util'
import { Cache } from '../../icloud/drive/cache/Cache'
import { isDetailsCacheEntity } from '../../icloud/drive/cache/cachef'
import { fileName, HasName } from '../../icloud/drive/helpers'
import {
  DriveChildrenItem,
  DriveChildrenItemFile,
  DriveDetails,
  DriveDetailsPartialWithHierarchy,
  DriveDetailsRoot,
  DriveDetailsWithHierarchy,
  FolderLikeItem,
  Hierarchy,
  HierarchyItem,
  HierarchyRoot,
  HierarchyTrash,
  isAppLibraryItem,
  isFolderLikeItem,
  isHierarchyItemRoot,
  isHierarchyItemTrash,
} from '../../icloud/drive/types'
import { err } from '../../lib/errors'
import { logger } from '../../lib/logging'
import { Path } from '../../lib/util'

export const compareHierarchies = (cached: Hierarchy, actual: Hierarchy) => {
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
  cached: Hierarchy,
  actual: { hierarchy: Hierarchy; extension?: string; name: string; drivewsid: string; etag: string },
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

export const getCachedDetailsPartialWithHierarchyById = (
  cache: Cache,
  drivewsid: string,
): E.Either<Error, DriveDetailsPartialWithHierarchy> => {
  return pipe(
    E.Do,
    E.bind('details', () =>
      pipe(
        cache.getFolderByIdE(drivewsid),
        E.filterOrElse(isDetailsCacheEntity, () => err(`missing details`)),
      )),
    E.bind('hierarchy', () =>
      pipe(
        cache.getCachedHierarchyById(drivewsid),
        E.map(A.dropRight(1)),
      )),
    E.bind('items', ({ details }) =>
      E.of(details.content.items.map(item => ({
        drivewsid: item.drivewsid,
        docwsid: item.docwsid,
        etag: item.etag,
      })))),
    E.map(({ details, items, hierarchy }): DriveDetailsPartialWithHierarchy => ({
      ...details.content,
      items,
      hierarchy,
    })),
  )
}

export const compareByDrivewsid = <T extends { drivewsid: string; etag: string }>() =>
  Eq.contramap((a: T) => a.drivewsid)(string.Eq)

export const ordByDrivewsid = <T extends { drivewsid: string; etag: string }>() =>
  Ord.contramap((a: T) => a.drivewsid)(string.Ord)

export const compareDriveDetailsWithHierarchy = (
  cached: DriveDetailsWithHierarchy,
  actual: DriveDetailsWithHierarchy,
) => {
  return {
    etag: cached.etag !== actual.etag,
    name: cached.name !== actual.name,
    hierarchy: compareHierarchies(cached.hierarchy, actual.hierarchy),
    items: compareItems(cached.items, actual.items),
    oldPath: Path.join(hierarchyToPath(cached.hierarchy), fileName(cached)),
    newPath: Path.join(hierarchyToPath(actual.hierarchy), fileName(actual)),
  }
}

export const compareItemWithHierarchy = (
  cached: {
    etag: string
    name: string
    hierarchy: Hierarchy
    drivewsid: string
    extension?: string
  },
  actual: { etag: string; name: string; hierarchy: Hierarchy; drivewsid: string; extension?: string },
) => {
  return {
    etag: cached.etag !== actual.etag,
    name: cached.name !== actual.name,
    hierarchy: compareHierarchies(cached.hierarchy, actual.hierarchy),
    oldPath: Path.join(hierarchyToPath(cached.hierarchy), fileName(cached)),
    newPath: Path.join(hierarchyToPath(actual.hierarchy), fileName(actual)),
  }
}

export const getAppLibraries = (root: DriveDetailsRoot) =>
  pipe(
    root.items,
    A.filter(isAppLibraryItem),
  )

export const groupByType = (items: DriveChildrenItem[]) =>
  pipe(
    items,
    A.partition(isFolderLikeItem),
    ({ left, right }) => ({
      folders: right,
      files: left as DriveChildrenItemFile[],
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

export const groupByTypeTuple = (items: [DriveChildrenItem, DriveChildrenItem][]) =>
  pipe(
    items,
    A.partition(([a, b]) => isFolderLikeItem(a)),
    ({ left, right }) => ({
      folders: right as [FolderLikeItem, FolderLikeItem][],
      files: left as [DriveChildrenItemFile, DriveChildrenItemFile][],
    }),
  )

export const compareDetails = (cached: DriveDetails, actual: DriveDetails) => {
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
  root: HierarchyRoot | HierarchyTrash
  path: HierarchyItem[]
}

export const parsedHierarchyToPath = ({ root, path }: ParsedHierarchy): NormalizedPath => {
  let result = isHierarchyItemRoot(root) ? '/' : 'TRASH_ROOT/'

  for (const e of path) {
    result += fileName(e) + '/'
  }

  return normalizePath(result)
}

/*

*/
export const hierarchyToPath = (hierarchy: Hierarchy): NormalizedPath => {
  return pipe(
    hierarchy,
    A.map(hitem =>
      isHierarchyItemRoot(hitem)
        ? '/'
        : isHierarchyItemTrash(hitem)
        ? 'TRASH_ROOT/'
        : fileName(hitem)
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

export type Branded<A, B> = A & Brand<B>

export type NormalizedPath = Branded<string, NormalizedPathBrand>

const stripSlash = (s: string) => s == '/' ? s : s.replace(/\/$/, '')

export const normalizePath = (path: string): NormalizedPath => {
  return pipe(Path.normalize(path), stripSlash) as NormalizedPath
}

export const itemWithHierarchyToPath = (item: HasName & { hierarchy: Hierarchy }) => {
  return pipe(
    hierarchyToPath(item.hierarchy),
    _ => Path.join(_, fileName(item)),
    normalizePath,
  )
}
