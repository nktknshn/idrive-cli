import { identity, pipe } from "fp-ts/lib/function";
import * as NA from "fp-ts/lib/NonEmptyArray";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import * as O from "fp-ts/Option";
import micromatch from "micromatch";

import { isMatching } from "../../../util/glob-matching";
import { addLeadingSlash, normalizePath } from "../../../util/normalize-path";
import { Path } from "../../../util/path";
import * as TreeUtil from "../../../util/tree";
import { NEA } from "../../../util/types";
import { DriveLookup, DriveTree, Types } from "../..";
import { DriveFolderTree } from "../../util/drive-folder-tree";

export type ListRecursiveTreeResult = O.Option<
  DriveTree.TreeWithItemPath<Types.Root>
>;

const getScanned = (paths: NA.NonEmptyArray<string>) =>
  pipe(
    paths,
    NA.map(addLeadingSlash),
    NA.map(micromatch.scan),
    NA.map(scan =>
      scan.isGlob
        ? scan
        : micromatch.scan(Path.join(scan.base, "**"))
    ),
  );

// TODO use 0 depth for wildcards
/** List paths recursively. Globs are supported */
export const listRecursiveTree = (
  // globs might be plain paths (folders),
  // wildcards (like /test/*.txt)
  // or globstar patterns (like **/*.txt)
  { globs, depth, trash }: { globs: NA.NonEmptyArray<string>; depth: number; trash: boolean },
): DriveLookup.Lookup<NEA<ListRecursiveTreeResult>, DriveLookup.Deps> => {
  const scanned = getScanned(globs);
  const basepaths = pipe(
    scanned,
    // for globs starting with **
    NA.map(_ => _.base),
    NA.map(normalizePath),
  );

  const getTrees = (): DriveLookup.Lookup<NEA<DriveFolderTree<Types.DetailsDocwsRoot | Types.DetailsTrashRoot>>> =>
    trash
      ? DriveLookup.getFoldersTreesByPathsTrash(basepaths, depth)
      : DriveLookup.getFoldersTreesByPathsDocwsroot(basepaths, depth);

  return pipe(
    getTrees(),
    SRTE.map(NA.zip(scanned)),
    SRTE.map(NA.zip(basepaths)),
    SRTE.map(NA.map(([[tree, scan], basepath]) =>
      pipe(
        DriveTree.treeWithItems(tree),
        DriveTree.addPath(Path.dirname(basepath), identity),
        TreeUtil.filterTree(_ => isMatching(_.path, scan.input)),
      )
    )),
  );
};
