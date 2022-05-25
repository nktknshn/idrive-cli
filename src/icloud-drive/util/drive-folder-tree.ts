import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as TR from 'fp-ts/lib/Tree'
import { normalizePath } from '../../util/normalize-path'
import { Path } from '../../util/path'
import { T } from '..'

export type FolderDeep<T extends T.Details> = {
  readonly details: T
  readonly deep: true
}

export type FolderShallow<T extends T.Details> = {
  readonly details: T
  readonly deep: false
}

export type DriveFolderTree<T extends T.Details> = TR.Tree<FolderTreeValue<T>>

export type FolderTreeValue<T extends T.Details> = FolderDeep<T> | FolderShallow<T>

export type FlattenTreeItemP<T extends T.Details> = [
  path: string,
  item: T.DetailsOrFile<T>,
]

export type FlattenFolderTreeWithP<T extends T.Details> = FlattenTreeItemP<T>[]

export const shallowFolder = <T extends T.Details>(details: T): DriveFolderTree<T> =>
  TR.make(
    {
      details,
      deep: false,
    },
  )

export const deepFolder = <T extends T.Details | T.NonRootDetails>(
  details: T,
  children: TR.Forest<FolderTreeValue<T>>,
): DriveFolderTree<T> =>
  TR.make({
    details,
    deep: true,
  }, children)

export const treeWithFiles = <T extends T.Details>(tree: DriveFolderTree<T>): TR.Tree<T | T.DriveChildrenItemFile> => {
  const files: (T | T.DriveChildrenItemFile)[] = pipe(
    tree.value.details.items,
    A.filter(T.isFile),
  )

  return TR.make(
    tree.value.details,
    pipe(
      tree.forest.map(treeWithFiles),
      A.concat(
        files.map(f => TR.make(f)),
      ),
    ),
  )
}

export const addPathToFolderTree = <T>(
  parentPath: string,
  f: (value: T) => T.HasName,
) =>
  (tree: TR.Tree<T>): TR.Tree<{ item: T; path: string }> => {
    const name = T.fileNameAddSlash(f(tree.value))
    const path = normalizePath(Path.join(parentPath, name))

    return TR.make(
      { item: tree.value, path },
      pipe(
        tree.forest,
        A.map(addPathToFolderTree(path, f)),
      ),
    )
  }

export const flattenFolderTreeWithBasepath = (
  parentPath: string,
) =>
  <T extends T.Details>(tree: DriveFolderTree<T>): FlattenFolderTreeWithP<T> => {
    const name = T.fileName(tree.value.details)
    const path = Path.normalize(Path.join(parentPath, name) //  + '/'
    )

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
      A.map(flattenFolderTreeWithBasepath(path)),
      A.flatten,
    )

    return [
      [path, tree.value.details],
      ...zippedsubfiles,
      ...subfolders,
    ]
  }

export const showFolderTree = <T extends T.Details>(tree: DriveFolderTree<T>): string => {
  const getSubTrees = (tree: DriveFolderTree<T>): TR.Tree<T.HasName> => {
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

export const drawFolderTree = <T extends T.Details>(tree: DriveFolderTree<T>): string => {
  return pipe(
    tree,
    TR.map(_ => T.fileNameAddSlash(_.details)),
    TR.drawTree,
  )
}
export const showTreeWithFiles = (
  tree: TR.Tree<{ item: T.DetailsDocwsRoot | T.NonRootDetails | T.DriveChildrenItemFile; path: string }>,
): string => {
  return pipe(
    tree,
    TR.map(_ => T.fileNameAddSlash(_.item)),
    TR.drawTree,
  )
}
