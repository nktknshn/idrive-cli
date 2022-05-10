import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { NormalizedPath, Path } from '../../../util/path'
import { NEA } from '../../../util/types'
import { DriveLookup, T } from '../..'
import { DriveFolderTree, flattenFolderTreeWithBasepath, FlattenFolderTreeWithP } from '../../util/drive-folder-tree'
import { usingTempCache } from './cache-temp-cache'

export const getFoldersTreesByPathsDocwsroot = (
  paths: NEA<NormalizedPath>,
  depth = Infinity,
): DriveLookup.Effect<NEA<DriveFolderTree<T.DetailsDocwsRoot | T.NonRootDetails>>> =>
  pipe(
    DriveLookup.getByPathsFoldersStrictDocwsroot(paths),
    SRTE.chain(dir => DriveLookup.getFoldersTrees(dir, depth)),
    usingTempCache,
  )

export const getFolderTreeByPathDocwsroot = (
  path: NormalizedPath,
  depth = Infinity,
): DriveLookup.Effect<DriveFolderTree<T.DetailsDocwsRoot | T.NonRootDetails>> =>
  pipe(
    getFoldersTreesByPathsDocwsroot([path], depth),
    SRTE.map(NA.head),
  )

export const getFoldersTreesByPathFlattenDocwsroot = (
  paths: NEA<NormalizedPath>,
  depth = Infinity,
): DriveLookup.Effect<
  NEA<FlattenFolderTreeWithP<T.DetailsDocwsRoot | T.NonRootDetails>>
> =>
  pipe(
    // provide existing cache for getByPathsFromCache
    // and accumulate new details here
    DriveLookup.getByPathsFoldersStrictDocwsroot(paths),
    // and use here
    SRTE.chain(dirs => DriveLookup.getFoldersTrees(dirs, depth)),
    SRTE.map(NA.zip(paths)),
    SRTE.map(NA.map(
      ([tree, path]) => flattenFolderTreeWithBasepath(Path.dirname(path))(tree),
    )),
    usingTempCache,
  )

export const getFolderTreeByPathFlattenWPDocwsroot = (
  path: NormalizedPath,
  depth = Infinity,
): DriveLookup.Effect<FlattenFolderTreeWithP<T.DetailsDocwsRoot | T.NonRootDetails>> =>
  pipe(
    getFoldersTreesByPathFlattenDocwsroot([path], depth),
    SRTE.map(NA.head),
  )
