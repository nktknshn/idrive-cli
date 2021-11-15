import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import Path from 'path'
import { isObjectWithOwnProperty } from '../../lib/util'
import {
  DriveChildrenItem,
  DriveDetails,
  DriveDetailsRoot,
  Hierarchy,
  isFolderDetails,
  isFolderLike,
  isHierarchyItemRoot,
  isHierarchyItemTrash,
  isInvalidId,
  isRootDetails,
  MaybeNotFound,
  rootDrivewsid,
} from './types'

export function parsePath(path: string): NA.NonEmptyArray<string> {
  const parsedPath = Path.normalize(path)
    .replace(/^\//, '')
    .replace(/\/$/, '')
    .split('/')

  return parsedPath.length == 1 && parsedPath[0] == ''
    ? ['/']
    : ['/', ...parsedPath]
}

export function ensureNestedPath(path: string): O.Option<NA.NonEmptyArray<string>> {
  const parsedPath = parsePath(path)

  if (parsedPath.length == 1) {
    return O.none
  }

  return pipe(
    parsedPath,
    A.dropLeft(1),
    NA.fromArray,
  )
}

export const normalizePath = (path: string) => {
  const [root, ...rest] = parsePath(path)

  return `${root}${rest.join('/')}`
}

export const splitParent = (path: string) => {
  const parent = Path.parse(path).dir
  const name = Path.parse(path).name

  return name === '' ? O.none : O.some([parent, name] as const)
}

type WithFileName = {
  name: string
  extension?: string
  drivewsid: string
}

export const fileName = (item: {
  drivewsid: string
  name: string
  extension?: string
}) =>
  (item.drivewsid === rootDrivewsid)
    ? '/'
    : item.extension
    ? `${item.name}${item.extension ? `.${item.extension}` : ''}`
    : `${item.name}`
// item.type === 'FILE'
//   ? `${item.name}${item.extension ? `.${item.extension}` : ''}`
//   : `${item.name}`

export const hierarchyToPath = (hierarchy: Hierarchy) => {
  return pipe(
    hierarchy,
    A.map(hitem =>
      isHierarchyItemRoot(hitem)
        ? '/'
        : isHierarchyItemTrash(hitem)
        ? 'TRASH_ROOT/'
        : fileName(hitem)
    ),
    _ => _.join('/'),
    Path.normalize,
  )
}

export const zipIds = <T>(drivewsids: string[], details: MaybeNotFound<T>[]) => {
  return pipe(
    A.zip(drivewsids, details),
    A.partitionMap(([dwid, d]) => isInvalidId(d) ? E.left(dwid) : E.right(d)),
    ({ left: missed, right: found }) => ({ missed, found }),
  )
}
