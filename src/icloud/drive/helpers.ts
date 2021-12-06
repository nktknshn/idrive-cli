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
import { hasOwnProperty, isObjectWithOwnProperty } from '../../lib/util'
import {
  Details,
  DetailsRoot,
  DriveChildrenItem,
  Hierarchy,
  isDetails,
  isFolderLike,
  isHierarchyItemRoot,
  isHierarchyItemTrash,
  isInvalidId,
  isRootDetails,
  MaybeNotFound,
} from './types'
import { rootDrivewsid, trashDrivewsid } from './types-io'

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

// type Not<A, B, A| B> = asd

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

export const parseName = (fileName: string): { name: string; extension?: string } => {
  const extension = pipe(
    Path.extname(fileName),
    _ => _ === '' ? undefined : _,
  )

  return {
    name: extension ? fileName.slice(0, fileName.length - extension.length) : fileName,
    extension: extension ? extension.slice(1) : undefined,
  }
}
