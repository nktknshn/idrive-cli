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

export type RemoteFolder<R extends Types.Details> = {
  remotepath: string
  remotefile: Types.DetailsOrRoot<R>
}

export type RemoteFileItem = {
  remotepath: string
  remotefile: Types.DriveChildrenItemFile
}

// item of a folder
export type RemoteFolderItem = {
  remotepath: string
  remotefile: Types.FolderLikeItem
}

export type FlattenTreeItemP<R extends Types.Details> =
  | RemoteFolder<R>
  | RemoteFileItem
  | RemoteFolderItem

export type FlattenFolderTreeWPath<R extends Types.Details> = FlattenTreeItemP<R>[]

export type TreeWithItemsValue<R extends Types.Details> =
  | Types.DetailsOrRoot<R>
  | Types.DriveChildrenItemFile
  | Types.FolderLikeItem

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
      pipe(
        tree.forest,
        A.map(addPath(path, f)),
      ),
    )
  }

/** Covnerts a tree into a list of items with their full paths */
export const flattenFolderTreeWithBasepath = (
  parentPath: string,
) =>
  <R extends Types.Root>(tree: DriveFolderTree<R>): FlattenFolderTreeWPath<R> => {
    const name = Types.fileName(tree.value.details)
    const path = Path.normalize(Path.join(parentPath, name))

    const subfiles = pipe(
      tree.value.details.items,
      A.filter(Types.isFile),
    )

    const zippedsubfiles = pipe(
      subfiles,
      A.map(Types.fileName),
      A.map(f => Path.join(path, f)),
      A.zip(subfiles),
      A.map(([remotepath, remotefile]) => ({ remotepath, remotefile })),
    )

    const subfoldersItems = pipe(
      tree.value.details.items,
      A.filter(Types.isFolderLikeItem),
    )

    const zippedsubfoldersItems = pipe(
      subfoldersItems,
      A.map(Types.fileName),
      A.map(f => Path.join(path, f)),
      A.zip(subfoldersItems),
      A.map(([remotepath, remotefile]) => ({ remotepath, remotefile })),
    )

    const subfolders = pipe(
      tree.forest,
      A.map(flattenFolderTreeWithBasepath(path)),
      A.flatten,
    )

    return [
      { remotefile: tree.value.details, remotepath: path },
      ...zippedsubfiles,
      // skip adding subfolders items if the tree is deep
      ...(!tree.value.deep ? zippedsubfoldersItems : []),
      ...subfolders,
    ]
  }

export const showFolderTree = <R extends Types.Root>(tree: DriveFolderTree<R>): string => {
  const witems = treeWithItems(tree)
  return pipe(
    witems,
    TR.map(Types.fileNameAddSlash),
    TR.drawTree,
  )
}

export const showTreeWithItemsP = (
  tree: TR.Tree<
    {
      item:
        | Types.DetailsDocwsRoot
        | Types.NonRootDetails
        | Types.DriveChildrenItemFile
        | Types.FolderLikeItem
      path: string
    }
  >,
): string => {
  return pipe(
    tree,
    TR.map(_ => Types.fileNameAddSlash(_.item)),
    TR.drawTree,
  )
}
