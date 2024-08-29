import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { fromEquals } from 'fp-ts/lib/Eq'
import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import micromatch from 'micromatch'
import * as T from '../drive-types'

export const makeMissedFound = <T>(
  drivewsids: string[],
  details: T.MaybeInvalidId<T>[],
): { missed: string[]; found: T[] } => {
  return pipe(
    A.zip(drivewsids, details),
    A.partitionMap(([dwid, d]) => T.isInvalidId(d) ? E.left(dwid) : E.right(d)),
    ({ left: missed, right: found }) => ({ missed, found }),
  )
}

export function findInParentFilename(
  parent: T.NonRootDetails | T.DetailsDocwsRoot,
  itemName: string,
): O.Option<T.DriveChildrenItem>
export function findInParentFilename(
  parent: T.NonRootDetails | T.DetailsTrashRoot,
  itemName: string,
): O.Option<T.DriveChildrenTrashItem>
export function findInParentFilename<R extends T.Root>(
  parent: T.NonRootDetails | R,
  itemName: string,
): O.Option<R extends T.DetailsDocwsRoot ? T.DriveChildrenItem : T.DriveChildrenTrashItem>
export function findInParentFilename(
  parent: T.NonRootDetails | T.DetailsTrashRoot | T.DetailsDocwsRoot,
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

export const getDrivewsid = (
  { zone, document_id, type }: { document_id: string; zone: string; type: string },
): string => {
  return `${type}::${zone}::${document_id}`
}

export const parseDrivewsid = (drivewsid: string) => {
  const [type, zone, docwsid] = drivewsid.split('::')
  return { type, zone, docwsid }
}
