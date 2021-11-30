import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import { unknown } from 'io-ts'
import * as t from 'io-ts'
import Path from 'path'
import { logger } from '../../lib/logging'
import { EmptyObject } from '../../lib/types'
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
} from './types'
import { rootDrivewsid } from './types-io'

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

// export const normalizePath = (path: string) => {
//   const [root, ...rest] = parsePath(path)

//   return `${root}${rest.join('/')}`
// }

export const splitParent = (path: string) => {
  const parent = Path.parse(path).dir
  const name = Path.parse(path).name

  return name === '' ? O.none : O.some([parent, name] as const)
}

export type HasName = {
  drivewsid: string
  name: string
  extension?: string
}

export const hasName = <
  A extends HasName,
  B extends Record<string, unknown>,
>(a: A | B): a is A => {
  return t.intersection([
    t.type({ drivewsid: t.string, name: t.string }),
    t.partial({ extension: t.string }),
  ]).is(a)
}

export const fileName = (item: HasName) =>
  (item.drivewsid === rootDrivewsid)
    ? '/'
    : item.extension
    ? `${item.name}${item.extension.length > 0 ? `.${item.extension}` : ''}`
    : `${item.name}`

export const getMissedFound = <T>(drivewsids: string[], details: MaybeNotFound<T>[]) => {
  return pipe(
    A.zip(drivewsids, details),
    A.partitionMap(([dwid, d]) => isInvalidId(d) ? E.left(dwid) : E.right(d)),
    ({ left: missed, right: found }) => ({ missed, found }),
  )
}

export const recordFromTuples = <T>(ts: readonly [string, T][]): Record<string, T> => {
  const obj: any = {}

  for (const [k, v] of ts) {
    obj[k] = v
  }

  return obj
}
