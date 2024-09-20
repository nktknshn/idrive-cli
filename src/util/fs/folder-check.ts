import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/lib/function";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import { DepFs } from "../../deps-types";
import { Path } from "../path";
import { FsStats } from ".";
import { isEnoentError } from "./is-enoent-error";

type Deps = DepFs<"fstat">;

/** Returns false if the folder does not exist or the path is not a folder */
export const checkFolderExists = (path: string): RTE.ReaderTaskEither<Deps, Error, boolean> => ({ fs }) =>
  pipe(
    fs.fstat(path),
    TE.chain((a) =>
      a.isDirectory()
        ? TE.right(true)
        : TE.right(false)
    ),
    TE.fold(e =>
      isEnoentError(e)
        ? T.of(E.right(false))
        : T.of(E.left(e)), TE.right),
  );

export type CheckPathResultFolder = {
  exists: true;
  isFolder: true;
  stats: FsStats;
};

export type CheckPathResultFile = {
  exists: true;
  isFolder: false;
  stats: FsStats;
};

export type CheckPathResultNotExists = {
  exists: false;
  parentExists: boolean;
  parentStats?: FsStats;
};

/** Represents cases: 1. folder exists, 2. file exists, 3. parent folder of the path exists 4. path is invalid */
export type CheckPathResult =
  | CheckPathResultFolder
  | CheckPathResultFile
  | CheckPathResultNotExists;

export const checkPath = (path: string): RTE.ReaderTaskEither<Deps, Error, CheckPathResult> => ({ fs }) => async () => {
  const parentPath = Path.dirname(path);

  const fstatPath = fs.fstat(path);
  const fstatParent = fs.fstat(parentPath);

  const fstatPathE = await fstatPath();

  if (E.isLeft(fstatPathE) && isEnoentError(fstatPathE.left)) {
    const fstatParentE = await fstatParent();

    if (E.isLeft(fstatParentE)) {
      return fstatParentE;
    }

    return E.right({
      exists: false,
      parentExists: true,
      parentStats: fstatParentE.right,
    });
  }

  if (E.isLeft(fstatPathE)) {
    return fstatPathE;
  }

  return E.right({
    exists: true,
    isFolder: fstatPathE.right.isDirectory(),
    stats: fstatPathE.right,
  });
};
