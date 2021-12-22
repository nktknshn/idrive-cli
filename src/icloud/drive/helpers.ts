import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import Path from 'path'
import { isInvalidId, MaybeNotFound } from './requests/types/types'

export function parsePath(path: string): NA.NonEmptyArray<string> {
  const parsedPath = Path.normalize(path)
    .replace(/^\//, '')
    .replace(/\/$/, '')
    .split('/')

  return parsedPath.length == 1 && parsedPath[0] == ''
    ? ['/']
    : ['/', ...parsedPath]
}

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
