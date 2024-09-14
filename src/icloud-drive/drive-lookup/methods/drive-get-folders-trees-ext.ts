import { pipe } from "fp-ts/lib/function";
import * as NA from "fp-ts/lib/NonEmptyArray";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import { NormalizedPath, Path } from "../../../util/path";
import { NEA } from "../../../util/types";
import { DriveLookup, DriveTree, Types } from "../..";
import { DriveFolderTree } from "../../util/drive-folder-tree";

/** Returns a list of folder trees for the given paths. Throws an error if any of `paths` do not exist or are not a folder. */
export const getFoldersTreesByPathsDocwsroot = (
  paths: NEA<NormalizedPath>,
  depth = Infinity,
): DriveLookup.Lookup<NEA<DriveFolderTree<Types.DetailsDocwsRoot>>> =>
  pipe(
    DriveLookup.getByPathsFoldersStrictDocwsroot(paths),
    SRTE.chain(dir => DriveLookup.getFoldersTrees(dir, depth)),
    // saves calls for overlapping paths
    DriveLookup.usingTempCache,
  );

export const getFoldersTreesByPathsTrash = (
  paths: NEA<NormalizedPath>,
  depth = Infinity,
): DriveLookup.Lookup<NEA<DriveFolderTree<Types.DetailsTrashRoot>>> =>
  pipe(
    DriveLookup.getByPathsFoldersStrictTrash(paths),
    SRTE.chain(dir => DriveLookup.getFoldersTrees(dir, depth)),
    // saves calls for overlapping paths
    DriveLookup.usingTempCache,
  );

export const getFoldersTreesByPathsFlattenDocwsroot = (
  paths: NEA<NormalizedPath>,
  depth = Infinity,
): DriveLookup.Lookup<
  NEA<DriveTree.FlattenWithItems<Types.DetailsDocwsRoot>>
> => {
  return pipe(
    DriveLookup.getFoldersTreesByPathsDocwsroot(paths, depth),
    SRTE.map(NA.zip(paths)),
    SRTE.map(NA.map(
      ([tree, path]) => DriveTree.flattenTreeWithItems<Types.DetailsDocwsRoot>(Path.dirname(path))(tree),
    )),
  );
};
export const getFolderTreeByPathDocwsroot = (
  path: NormalizedPath,
  depth = Infinity,
): DriveLookup.Lookup<DriveFolderTree<Types.DetailsDocwsRoot>> =>
  pipe(
    getFoldersTreesByPathsDocwsroot([path], depth),
    SRTE.map(NA.head),
  );

export const getFolderTreeByPathFlattenDocwsroot = (
  path: NormalizedPath,
  depth = Infinity,
): DriveLookup.Lookup<DriveTree.FlattenWithItems<Types.DetailsDocwsRoot>> =>
  pipe(
    getFoldersTreesByPathsFlattenDocwsroot([path], depth),
    SRTE.map(NA.head),
  );
