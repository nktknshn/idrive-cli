import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { NormalizedPath, Path } from '../../../util/path'
import { NEA } from '../../../util/types'
import { DriveLookup, Types } from '../..'
import { DriveFolderTree, flattenFolderTreeWithBasepath, FlattenFolderTreeWPath } from '../../util/drive-folder-tree'

/** Returns a list of folder trees for the given paths */
export const getFoldersTreesByPathsDocwsroot = (
  paths: NEA<NormalizedPath>,
  depth = Infinity,
): DriveLookup.Lookup<NEA<DriveFolderTree<Types.DetailsDocwsRoot>>> =>
  pipe(
    DriveLookup.getByPathsFoldersStrictDocwsroot(paths),
    SRTE.chain(dir => DriveLookup.getFoldersTrees(dir, depth)),
    // save calls for overlapping paths
    DriveLookup.usingTempCache,
  )

export const getFolderTreeByPathDocwsroot = (
  path: NormalizedPath,
  depth = Infinity,
): DriveLookup.Lookup<DriveFolderTree<Types.DetailsDocwsRoot>> =>
  pipe(
    getFoldersTreesByPathsDocwsroot([path], depth),
    SRTE.map(NA.head),
  )

export const getFoldersTreesByPathsFlattenDocwsroot = (
  paths: NEA<NormalizedPath>,
  depth = Infinity,
): DriveLookup.Lookup<
  NEA<FlattenFolderTreeWPath<Types.DetailsDocwsRoot>>
> => {
  return pipe(
    DriveLookup.getByPathsFoldersStrictDocwsroot(paths),
    SRTE.chain(dirs => DriveLookup.getFoldersTrees<Types.DetailsDocwsRoot>(dirs, depth)),
    DriveLookup.usingTempCache,
    SRTE.map(NA.zip(paths)),
    SRTE.map(NA.map(
      ([tree, path]) => flattenFolderTreeWithBasepath(Path.dirname(path))<Types.DetailsDocwsRoot>(tree),
    )),
  )
}

export const getFolderTreeByPathFlattenWPDocwsroot = (
  path: NormalizedPath,
  depth = Infinity,
): DriveLookup.Lookup<FlattenFolderTreeWPath<Types.DetailsDocwsRoot>> =>
  pipe(
    getFoldersTreesByPathsFlattenDocwsroot([path], depth),
    SRTE.map(NA.head),
  )
