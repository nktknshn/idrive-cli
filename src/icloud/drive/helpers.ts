import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { fromEquals } from 'fp-ts/lib/Eq'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import { Refinement } from 'fp-ts/lib/Refinement'
import micromatch from 'micromatch'
import Path from 'path'
import * as T from './types'

export function parsePath(path: string): NA.NonEmptyArray<string> {
  const parsedPath = Path.normalize(path)
    .replace(/^\//, '')
    .replace(/\/$/, '')
    .split('/')

  return parsedPath.length == 1 && parsedPath[0] == ''
    ? ['/']
    : ['/', ...parsedPath]
}

export const getMissedFound = <T>(
  drivewsids: string[],
  details: T.MaybeInvalidId<T>[],
): { missed: string[]; found: T[] } => {
  return pipe(
    A.zip(drivewsids, details),
    A.partitionMap(([dwid, d]) => T.isInvalidId(d) ? E.left(dwid) : E.right(d)),
    ({ left: missed, right: found }) => ({ missed, found }),
  )
}

export const recordFromTuples = <T, K extends string>(ts: (readonly [K, T])[]): Record<string, T> => {
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

export const findInParentFilename = <R extends T.Root>(
  parent: T.NonRootDetails | R,
  itemName: string,
): O.Option<T.DriveChildrenItem | T.DriveChildrenTrashItem> => {
  return pipe(
    parent.items,
    A.findFirst((item: T.DriveChildrenItem | T.DriveChildrenTrashItem) => T.fileName(item) == itemName),
  )
}

export function findInParentFilename2(
  parent: T.NonRootDetails | T.DetailsDocwsRoot,
  itemName: string,
): O.Option<T.DriveChildrenItem>
export function findInParentFilename2(
  parent: T.NonRootDetails | T.DetailsTrash,
  itemName: string,
): O.Option<T.DriveChildrenTrashItem>
export function findInParentFilename2(
  parent: T.NonRootDetails | T.DetailsTrash | T.DetailsDocwsRoot,
  itemName: string,
): O.Option<T.DriveChildrenItem | T.DriveChildrenTrashItem> {
  return pipe(
    parent.items,
    A.findFirst((item: T.DriveChildrenItem | T.DriveChildrenTrashItem) => T.fileName(item) == itemName),
  )
}

export const findInParentGlob = <R extends T.Root>(
  parent: T.NonRootDetails | R,
  glob: string,
): (T.DriveChildrenItem | T.DriveChildrenTrashItem)[] => {
  return pipe(
    parent.items,
    A.filter(
      item =>
        glob.length > 0
          ? micromatch.isMatch(
            T.fileName(item),
            glob,
            { basename: true, noglobstar: true },
          )
          : true,
    ),
  )
}

export const equalsDrivewsId = <T extends string>() =>
  fromEquals((a: { drivewsid: T }, b: { drivewsid: T }) => a.drivewsid == b.drivewsid)

export const prependPath = (parent: string) => (kid: string) => Path.join(parent, kid)

export const getDrivewsid = ({ zone, document_id, type }: { document_id: string; zone: string; type: string }) => {
  return `${type}::${zone}::${document_id}`
}
