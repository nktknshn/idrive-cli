import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as TR from 'fp-ts/lib/Tree'
import { normalizePath } from '../../util/normalize-path'
import { Path } from '../../util/path'
import { Types } from '..'

/** Has forest (for the subfolders there were details retrieved from the api) */
export type FolderDeep<R extends Types.Details> = {
  readonly details: Types.DetailsOrRoot<R>
  readonly deep: true
}

/** Has no forest. Just details the folder details */
export type FolderShallow<R extends Types.Details> = {
  readonly details: Types.DetailsOrRoot<R>
  readonly deep: false
}

export type FolderTreeValue<R extends Types.Details> = FolderDeep<R> | FolderShallow<R>

/** Drive folder tree. Value is a list of folders and files */
export type DriveFolderTree<R extends Types.Details> = TR.Tree<FolderTreeValue<R>>

export const shallowFolder = <R extends Types.Details>(details: Types.DetailsOrRoot<R>): DriveFolderTree<R> =>
  TR.make({ details, deep: false })

export const deepFolder = <R extends Types.Details>(
  details: R,
  children: TR.Forest<FolderTreeValue<R>>,
): DriveFolderTree<R> => TR.make({ details, deep: true }, children)

export type TreeWithItemsValue<R extends Types.Details> =
  | R
  | Types.DetailsFolder
  | Types.DetailsAppLibrary
  | Types.DriveChildrenItemFile
  // extracted from the details
  | Types.DriveChildrenItemFolder
  | Types.DriveChildrenItemAppLibrary

/** Extract files/folder items from folders details making them tree values */
export const treeWithItems = <R extends Types.Details>(
  tree: DriveFolderTree<R>,
): TR.Tree<
  TreeWithItemsValue<R>
> => {
  const filesitems = pipe(
    tree.value.details.items,
    A.filter(Types.isFile),
  )

  const foldersitems = pipe(
    tree.value.details.items,
    A.filter(Types.isFolderLikeItem),
  )

  const folders = tree.forest.map(treeWithItems)

  return TR.make(
    tree.value.details,
    pipe(
      filesitems.map(f => TR.make(f)),
      A.concatW(
        folders.length > 0
          ? folders
          : foldersitems.map(f => TR.make(f)),
      ),
    ),
  )
}

/** Add full path to folder tree value */
export const addPath = <T>(
  parentPath: string,
  f: (value: T) => Types.HasName,
) =>
  (tree: TR.Tree<T>): TR.Tree<{ item: T; path: string }> => {
    const name = Types.fileNameAddSlash(f(tree.value))
    const path = normalizePath(Path.join(parentPath, name))

    return TR.make(
      { item: tree.value, path },
      pipe(tree.forest, A.map(addPath(path, f))),
    )
  }

/** Tree with path and items/details */
export type TreeWithItemPath<R extends Types.Details> = TR.Tree<WithItemPathValue<R>>

export type WithItemPathValue<R extends Types.Details> = {
  path: string
  item: TreeWithItemsValue<R>
}

export type FlattenWithItems<R extends Types.Details> = WithItemPathValue<R>[]

export const flattenTree = <A>(tree: TR.Tree<A>): A[] => {
  const res: A[] = []
  const go = (tree: TR.Tree<A>) => {
    res.push(tree.value)
    for (const child of tree.forest) {
      go(child)
    }
  }
  go(tree)
  return res
}

export const showFolderTree = <R extends Types.Root>(tree: DriveFolderTree<R>): string => {
  const witems = treeWithItems(tree)
  return pipe(
    witems,
    TR.map(Types.fileNameAddSlash),
    TR.drawTree,
  )
}

export const showTreeWithItems = (
  tree: TR.Tree<{ item: Types.HasName; path: string }>,
): string => {
  return pipe(
    tree,
    TR.map(_ => Types.fileNameAddSlash(_.item)),
    TR.drawTree,
  )
}
