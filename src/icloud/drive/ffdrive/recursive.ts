import { sequenceS } from 'fp-ts/lib/Apply'
import * as A from 'fp-ts/lib/Array'
import { apply, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TR from 'fp-ts/lib/Tree'
import { logger } from '../../../lib/logging'
import { NEA } from '../../../lib/types'
import * as DF from '../ffdrive'
import * as T from '../requests/types/types'

const ado = sequenceS(SRTE.Apply)

export type FolderTreeDeep<T extends T.Details = T.Details> = {
  readonly details: T
  readonly deep: true
}

export type FolderTreeShallow<T extends T.Details = T.Details> = {
  readonly details: T
  readonly deep: false
}

export type FolderTree<T extends T.Details = T.Details> = TR.Tree<FolderTreeValue<T>>

export type FolderTreeValue<T extends T.Details = T.Details> = FolderTreeDeep<T> | FolderTreeShallow<T>

export const getSubfolders = (folders: T.Details[]): (T.FolderLikeItem)[] =>
  pipe(
    folders,
    A.map(folder => pipe(folder.items, A.filter(T.isFolderLikeItem))),
    A.reduce([], A.getSemigroup<T.FolderLikeItem>().concat),
  )

export function getFoldersRecursivelyD(
  folders: NEA<T.NonRootDetails>,
  depth: number,
): DF.DriveM<NEA<FolderTree<T.NonRootDetails>>>
export function getFoldersRecursivelyD(
  folders: NEA<T.DetailsDocwsRoot | T.NonRootDetails>,
  depth: number,
): DF.DriveM<NEA<FolderTree<T.Details>>>
export function getFoldersRecursivelyD(
  folders: NEA<T.DetailsDocwsRoot | T.NonRootDetails>,
  depth: number,
): DF.DriveM<
  NEA<FolderTree<T.Details>>
> {
  logger.debug(`subfolders: ${folders.map(_ => _.items)}`)

  const subfolders = getSubfolders(folders)

  const doGoDeeper = depth > 0 && subfolders.length > 0
  const depthExceed = subfolders.length > 0 && depth == 0

  return pipe(
    A.isNonEmpty(subfolders) && doGoDeeper
      ? pipe(
        DF.retrieveItemDetailsInFoldersSavingE(
          pipe(subfolders, NA.map(_ => _.drivewsid)),
        ),
        DF.chain(details => getFoldersRecursivelyD(details, depth - 1)),
        SRTE.map(
          groupBy(_ => _.value.details.parentId),
        ),
        SRTE.map(g => zipWithChildren(folders, g)),
        SRTE.map(NA.map(([parent, children]) => deepFolder(parent, children))),
      )
      : depthExceed
      ? SRTE.of(pipe(folders, NA.map(shallowFolder)))
      : SRTE.of(pipe(folders, NA.map(f => deepFolder(f, [])))),
  )
}

const zipWithChildren = (
  folders: NEA<T.Details>,
  itemByParentId: Record<string, FolderTree[]>,
): NEA<(readonly [T.Details, FolderTree[]])> =>
  pipe(
    folders,
    NA.map(folder =>
      [
        folder,
        pipe(
          itemByParentId,
          R.lookup(folder.drivewsid),
          O.getOrElseW(() => []),
        ),
      ] as const
    ),
  )

const groupBy = <T>(f: (item: T) => string): (items: T[]) => Record<string, T[]> =>
  (items: T[]): Record<string, T[]> => {
    let result: Record<string, T[]> = {}

    for (const el of items) {
      result = pipe(
        result,
        R.lookup(f(el)),
        O.getOrElse((): T[] => []),
        children => R.upsertAt(f(el), [...children, el]),
        apply(result),
      )
    }

    return result
  }

export const shallowFolder = (details: T.Details): FolderTree =>
  TR.make(
    {
      details,
      deep: false,
    },
  )

export const deepFolder = (details: T.Details, children: TR.Forest<FolderTreeValue>): FolderTree =>
  TR.make({
    details,
    deep: true,
  }, children)
