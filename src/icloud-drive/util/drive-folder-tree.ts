import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as TR from 'fp-ts/lib/Tree'
import { normalizePath } from '../../util/normalize-path'
import { Path } from '../../util/path'
import { Types } from '..'

export type FolderDeep<R extends Types.Details> = {
  readonly details: Types.DetailsOfRoot<R>
  readonly deep: true
}

export type FolderShallow<R extends Types.Details> = {
  readonly details: Types.DetailsOfRoot<R>
  readonly deep: false
}

export type DriveFolderTree<R extends Types.Details> = TR.Tree<FolderTreeValue<R>>

export type FolderTreeValue<R extends Types.Details> = FolderDeep<R> | FolderShallow<R>

type RemoteFolder<R extends Types.Details> = {
  remotepath: string
  remotefile: Types.DetailsOfRoot<R>
}

export type FlattenTreeItemP<R extends Types.Details> = RemoteFile | RemoteFolder<R>

export type RemoteFile = {
  remotepath: string
  remotefile: Types.DriveChildrenItemFile
}

export type FlattenFolderTreeWPath<R extends Types.Details> = FlattenTreeItemP<R>[]

export const shallowFolder = <R extends Types.Details>(details: Types.DetailsOfRoot<R>): DriveFolderTree<R> =>
  TR.make({ details, deep: false })

export const deepFolder = <R extends Types.Details>(
  details: R,
  children: TR.Forest<FolderTreeValue<R>>,
): DriveFolderTree<R> => TR.make({ details, deep: true }, children)

export const treeWithFiles = <R extends Types.Details>(
  tree: DriveFolderTree<R>,
): TR.Tree<Types.DetailsOfRoot<R> | Types.DriveChildrenItemFile> => {
  const files: (Types.DetailsOfRoot<R> | Types.DriveChildrenItemFile)[] = pipe(
    tree.value.details.items,
    A.filter(Types.isFile),
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
  f: (value: T) => Types.HasName,
) =>
  (tree: TR.Tree<T>): TR.Tree<{ item: T; path: string }> => {
    const name = Types.fileNameAddSlash(f(tree.value))
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
  <R extends Types.Root>(tree: DriveFolderTree<R>): FlattenFolderTreeWPath<R> => {
    const name = Types.fileName(tree.value.details)
    const path = Path.normalize(Path.join(parentPath, name) //  + '/'
    )

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

export const showFolderTree = <R extends Types.Root>(tree: DriveFolderTree<R>): string => {
  const getSubTrees = (tree: DriveFolderTree<R>): TR.Tree<Types.HasName> => {
    const files: Types.HasName[] = pipe(
      tree.value.details.items,
      A.filter(Types.isFile),
    )

    return TR.make(
      tree.value.details as Types.HasName,
      A.concat(
        files.map(f => TR.make(f)),
      )(tree.forest.map(f => getSubTrees(f))),
    )
  }

  return pipe(
    getSubTrees(tree),
    TR.map(Types.fileNameAddSlash),
    TR.drawTree,
  )
}

export const drawFolderTree = <R extends Types.Root>(tree: DriveFolderTree<R>): string => {
  return pipe(
    tree,
    TR.map(_ => Types.fileNameAddSlash(_.details)),
    TR.drawTree,
  )
}
export const showTreeWithFiles = (
  tree: TR.Tree<{ item: Types.DetailsDocwsRoot | Types.NonRootDetails | Types.DriveChildrenItemFile; path: string }>,
): string => {
  return pipe(
    tree,
    TR.map(_ => Types.fileNameAddSlash(_.item)),
    TR.drawTree,
  )
}
