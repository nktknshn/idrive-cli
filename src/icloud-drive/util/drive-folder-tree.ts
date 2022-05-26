import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as TR from 'fp-ts/lib/Tree'
import { normalizePath } from '../../util/normalize-path'
import { Path } from '../../util/path'
import { T } from '..'

export type FolderDeep<R extends T.Details> = {
  readonly details: T.DetailsOfRoot<R>
  readonly deep: true
}

export type FolderShallow<R extends T.Details> = {
  readonly details: T.DetailsOfRoot<R>
  readonly deep: false
}

export type DriveFolderTree<R extends T.Details> = TR.Tree<FolderTreeValue<R>>

export type FolderTreeValue<R extends T.Details> = FolderDeep<R> | FolderShallow<R>

type RemoteFolder<R extends T.Details> = {
  remotepath: string
  remotefile: T.DetailsOfRoot<R>
}

export type FlattenTreeItemP<R extends T.Details> = RemoteFile | RemoteFolder<R>

export type RemoteFile = {
  remotepath: string
  remotefile: T.DriveChildrenItemFile
}

export type FlattenFolderTreeWPath<R extends T.Details> = FlattenTreeItemP<R>[]

export const shallowFolder = <R extends T.Details>(details: T.DetailsOfRoot<R>): DriveFolderTree<R> =>
  TR.make({ details, deep: false })

export const deepFolder = <R extends T.Details>(
  details: R,
  children: TR.Forest<FolderTreeValue<R>>,
): DriveFolderTree<R> => TR.make({ details, deep: true }, children)

export const treeWithFiles = <R extends T.Details>(
  tree: DriveFolderTree<R>,
): TR.Tree<T.DetailsOfRoot<R> | T.DriveChildrenItemFile> => {
  const files: (T.DetailsOfRoot<R> | T.DriveChildrenItemFile)[] = pipe(
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
  <R extends T.Root>(tree: DriveFolderTree<R>): FlattenFolderTreeWPath<R> => {
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
      ...subfolders,
    ]
  }

export const showFolderTree = <R extends T.Root>(tree: DriveFolderTree<R>): string => {
  const getSubTrees = (tree: DriveFolderTree<R>): TR.Tree<T.HasName> => {
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

export const drawFolderTree = <R extends T.Root>(tree: DriveFolderTree<R>): string => {
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
