import { pipe } from "fp-ts/lib/function";
import * as NA from "fp-ts/lib/NonEmptyArray";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import micromatch from "micromatch";

import { err } from "../../../util/errors";
import { includesGlobstar } from "../../../util/glob-matching";
import { normalizePath } from "../../../util/normalize-path";
import { NEA } from "../../../util/types";
import { DriveLookup, Types } from "../..";
import { findInParentGlob } from "../../util/drive-helpers";
import * as GetByPath from "../../util/get-by-path-types";

export type ListPathResult = ListPathsFolder | ListPathsFile | ListPathInvalid;

export type ListPathsFolder = {
  isFile: false;
  valid: true;
  path: string;
  parentItem: Types.Root | Types.DetailsFolder | Types.DetailsAppLibrary;
  /** Filtered children */
  items: (Types.DriveChildrenItem | Types.DriveChildrenTrashItem)[];
  validation: GetByPath.PathValidFolder<Types.Root>;
};

export type ListPathsFile = {
  isFile: true;
  valid: true;
  path: string;
  item: Types.DriveChildrenItemFile;
  validation: GetByPath.PathValidFile<Types.Root>;
};

export type ListPathInvalid = {
  valid: false;
  validation: GetByPath.PathInvalid<Types.Root>;
  path: string;
};

const result = (
  path: string,
  scan: micromatch.ScanInfo,
  res: GetByPath.Result<Types.Root>,
): ListPathResult => {
  if (GetByPath.isInvalidPath(res)) {
    return { valid: false, path, validation: res };
  } else {
    if (GetByPath.isValidFile(res)) {
      return { valid: true, path, item: res.file, validation: res, isFile: true };
    } else {
      const folder = GetByPath.pathTarget(res);
      return {
        valid: true,
        path,
        parentItem: folder,
        items: findInParentGlob(folder, scan.glob),
        validation: res,
        isFile: false,
      };
    }
  }
};

/** Shallow listing of paths. It doesn't fail some of the paths are not valid. */
export const listShallow = (
  { paths, trash }: { paths: NA.NonEmptyArray<string>; trash: boolean },
): DriveLookup.Lookup<NEA<ListPathResult>, DriveLookup.Deps> => {
  const scanned = pipe(paths, NA.map(micromatch.scan));
  const basepaths = pipe(scanned, NA.map(_ => _.base), NA.map(normalizePath));

  if (includesGlobstar(paths)) {
    return SRTE.left(err("globstar is not supported for non recursive ls"));
  }

  return pipe(
    DriveLookup.getCachedRootOrTrash(trash),
    SRTE.chain(root => DriveLookup.getByPaths(root, basepaths)),
    SRTE.map(NA.zip(scanned)),
    SRTE.map(NA.zip(paths)),
    SRTE.map(
      NA.map(([[res, scan], path]) => result(path, scan, res)),
    ),
  );
};
