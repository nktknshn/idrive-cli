import { eq } from 'fp-ts'
import * as A from 'fp-ts/lib/Array'
import { apply, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { logger } from '../../../../util/logging'
import { NEA } from '../../../../util/types'
import * as T from '../../../drive-requests/icloud-drive-items-types'
import { DriveQuery } from '../..'
import { deepFolder, FolderTree, shallowFolder } from '../../util/folder-tree'

export function getFoldersTrees(
  folders: NEA<T.NonRootDetails>,
  depth: number,
): DriveQuery.Effect<NEA<FolderTree<T.NonRootDetails>>>
export function getFoldersTrees<R extends T.Root>(
  folders: NEA<R | T.NonRootDetails>,
  depth: number,
): DriveQuery.Effect<NEA<FolderTree<R | T.NonRootDetails>>>
export function getFoldersTrees<R extends T.Root | T.NonRootDetails>(
  folders: NEA<R | T.NonRootDetails>,
  depth: number,
): DriveQuery.Effect<NEA<FolderTree<R | T.NonRootDetails>>> {
  const subfolders = getSubfolders(folders)
  const doGoDeeper = depth > 0 && subfolders.length > 0
  const depthExceed = subfolders.length > 0 && depth == 0

  logger.debug(`getFoldersTrees(${folders.map(_ => _.drivewsid)})`)

  return pipe(
    A.isNonEmpty(subfolders) && doGoDeeper
      ? pipe(
        DriveQuery.retrieveItemDetailsInFoldersSavingStrict(
          pipe(subfolders, NA.uniq(eq.fromEquals((a, b) => a.drivewsid === b.drivewsid)), NA.map(_ => _.drivewsid)),
        ),
        SRTE.chain(
          subfoldersdetails =>
            getFoldersTrees(
              subfoldersdetails,
              depth - 1,
            ),
        ),
        SRTE.map(
          groupBy(_ => _.value.details.parentId),
        ),
        SRTE.map(g => zipWithChildren(folders, g)),
        SRTE.map(
          NA.map(([parent, children]) => deepFolder(parent, children)),
        ),
      )
      : depthExceed
      ? SRTE.of(pipe(folders, NA.map(shallowFolder)))
      : SRTE.of(pipe(folders, NA.map(f => deepFolder(f, [])))),
  )
}

const getSubfolders = (folders: T.Details[]): (T.FolderLikeItem)[] =>
  pipe(
    folders,
    A.map(folder => pipe(folder.items, A.filter(T.isFolderLikeItem))),
    A.flatten,
  )

const zipWithChildren = <T extends T.Details, R extends T.Details>(
  folders: NEA<T>,
  itemByParentId: Record<string, FolderTree<R>[]>,
): NEA<(readonly [T, FolderTree<R>[]])> =>
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
