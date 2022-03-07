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
import { Path } from '../../../lib/util'
import * as DF from '../drive'
import * as T from '../requests/types/types'

const ado = sequenceS(SRTE.Apply)

export const drawFolderTree = <T extends T.Details>(tree: FolderTree<T>) => {
  return pipe(
    tree,
    TR.map(_ => T.fileNameAddSlash(_.details)),
    TR.drawTree,
  )
}

export const treeWithFiles = <T extends T.Details>(tree: FolderTree<T>): TR.Tree<T | T.DriveChildrenItemFile> => {
  const files: (T | T.DriveChildrenItemFile)[] = pipe(
    tree.value.details.items,
    A.filter(T.isFile),
  )

  return TR.make(
    tree.value.details as T | T.DriveChildrenItemFile,
    pipe(
      tree.forest.map(f => treeWithFiles(f)),
      A.concat(
        files.map(f => TR.make(f)),
      ),
    ),
  )
}

export const drawFilesTree = <T extends T.Details>(tree: FolderTree<T>) => {
  const getSubTrees = (tree: FolderTree<T>): TR.Tree<T.HasName> => {
    const files: T.HasName[] = pipe(
      tree.value.details.items,
      A.filter(T.isFile),
    )

    return TR.make(
      tree.value.details as T.HasName,
      A.concat(
        files.map(f => TR.make(f)),
      )(tree.forest.map(f => getSubTrees(f))),
    )
  }

  return pipe(
    getSubTrees(tree),
    TR.map(T.fileNameAddSlash),
    TR.drawTree,
  )
}

export type FolderTreeDeep<T extends T.Details> = {
  readonly details: T
  readonly deep: true
}

export type FolderTreeShallow<T extends T.Details> = {
  readonly details: T
  readonly deep: false
}

export type FolderTree<T extends T.Details> = TR.Tree<FolderTreeValue<T>>

export type FolderTreeValue<T extends T.Details> = FolderTreeDeep<T> | FolderTreeShallow<T>

export const getSubfolders = (folders: T.Details[]): (T.FolderLikeItem)[] =>
  pipe(
    folders,
    A.map(folder => pipe(folder.items, A.filter(T.isFolderLikeItem))),
    A.flatten,
    // A.reduce([], A.getSemigroup<T.FolderLikeItem>().concat),
  )

export function getFoldersTrees<R extends T.Root>(
  folders: NEA<T.NonRootDetails>,
  depth: number,
): DF.DriveM<NEA<FolderTree<T.NonRootDetails>>>
export function getFoldersTrees<R extends T.Root>(
  folders: NEA<R | T.NonRootDetails>,
  depth: number,
): DF.DriveM<NEA<FolderTree<R | T.NonRootDetails>>>
export function getFoldersTrees<R extends T.Root | T.NonRootDetails>(
  folders: NEA<R | T.NonRootDetails>,
  depth: number,
): DF.DriveM<NEA<FolderTree<R | T.NonRootDetails>>> {
  const subfolders = getSubfolders(folders)
  const doGoDeeper = depth > 0 && subfolders.length > 0
  const depthExceed = subfolders.length > 0 && depth == 0

  return pipe(
    A.isNonEmpty(subfolders) && doGoDeeper
      ? pipe(
        DF.retrieveItemDetailsInFoldersSavingE(
          pipe(subfolders, NA.map(_ => _.drivewsid)),
        ),
        SRTE.chain(details => getFoldersTrees(details, depth - 1)),
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

export const zipFolderTreeWithPath = <T extends T.Details>(
  parentPath: string,
  tree: FolderTree<T>,
): [string, DF.DetailsOrFile<T>][] => {
  const name = T.fileName(tree.value.details)
  const path = Path.join(parentPath, name) + '/'

  const subfiles = pipe(
    tree.value.details.items,
    A.filter(T.isFile),
  )

  const zippedsubfiles = pipe(
    subfiles,
    A.map(T.fileName),
    A.map(f => Path.join(path, f)),
    A.zip(subfiles),
  )

  const subfolders = pipe(
    tree.forest,
    A.map(t => zipFolderTreeWithPath(path, t)),
    A.flatten,
  )

  return [
    [path, tree.value.details],
    ...zippedsubfiles,
    ...subfolders,
  ]
}

export const addPathToFolderTree = <T extends T.Details>(
  parentPath: string,
  tree: FolderTree<T>,
): TR.Tree<FolderTreeValue<T> & { path: string }> => {
  const name = T.fileNameAddSlash(tree.value.details)
  const path = Path.join(parentPath, name)

  return TR.make(
    { ...tree.value, path },
    pipe(
      tree.forest,
      A.map(t => addPathToFolderTree(path, t)),
    ),
  )
}

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

export const shallowFolder = <T extends T.Details>(details: T): FolderTree<T> =>
  TR.make(
    {
      details,
      deep: false,
    },
  )

export const deepFolder = <T extends T.Details | T.NonRootDetails>(
  details: T,
  children: TR.Forest<FolderTreeValue<T>>,
): FolderTree<T> =>
  TR.make({
    details,
    deep: true,
  }, children)
