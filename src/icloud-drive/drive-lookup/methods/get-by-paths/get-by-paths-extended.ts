import * as A from "fp-ts/lib/Array";
import { pipe } from "fp-ts/lib/function";
import * as NA from "fp-ts/lib/NonEmptyArray";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";

import { logger } from "../../../../logging/logging";
import { err } from "../../../../util/errors";
import { NormalizedPath } from "../../../../util/normalize-path";
import { NEA } from "../../../../util/types";
import { sequenceNArrayE } from "../../../../util/util";
import * as T from "../../../drive-types";
import * as V from "../../../util/get-by-path-types";
import { filterOrElse, Lookup, map } from "../..";
import { ItemIsNotFolderError } from "../../errors";
import { chainCachedDocwsRoot, chainCachedTrash, getCachedDocwsRoot } from "../get-roots";
import { getByPaths } from "./get-by-paths";

/** Fails if the path is not valid */
export const getByPathStrict = <R extends T.Root>(
  root: R,
  path: NormalizedPath,
): Lookup<T.DetailsOrFile<R>> => {
  return pipe(
    getByPathsStrict(root, [path]),
    map(NA.head),
  );
};

/** Fails if some of the paths are not valid */
export const getByPathsStrict = <R extends T.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
): Lookup<NEA<T.DetailsOrFile<R>>> => {
  return pipe(
    getByPaths(root, paths),
    SRTE.map(NA.map(
      V.asEither((res) => err(V.showGetByPathResult(res))),
    )),
    SRTE.chainEitherK(sequenceNArrayE),
  );
};

export const getByPathStrictDocwsroot = (
  path: NormalizedPath,
): Lookup<T.DetailsOrFile<T.DetailsDocwsRoot>> => {
  return pipe(
    getByPathsStrictDocwsroot([path]),
    map(NA.head),
  );
};

/** Fails if some of the paths are not valid */
export const getByPathsStrictDocwsroot = (
  paths: NEA<NormalizedPath>,
): Lookup<NEA<T.DetailsOrFile<T.DetailsDocwsRoot>>> => {
  return pipe(
    chainCachedDocwsRoot(root => getByPaths(root, paths)),
    SRTE.map(NA.map(
      V.asEither((res) => err(V.showGetByPathResult(res))),
    )),
    SRTE.chainEitherK(sequenceNArrayE),
  );
};

export const getByPathsStrictTrash = (
  path: NEA<NormalizedPath>,
): Lookup<NEA<T.DetailsOrFile<T.DetailsTrashRoot>>> => {
  return pipe(
    chainCachedTrash(root => getByPaths(root, path)),
    SRTE.map(NA.map(
      V.asEither((res) => err(V.showGetByPathResult(res))),
    )),
    SRTE.chainEitherK(sequenceNArrayE),
  );
};

export const getByPathStrictTrash = (
  path: NormalizedPath,
): Lookup<T.DetailsOrFile<T.DetailsTrashRoot>> => {
  return pipe(
    getByPathsStrictTrash([path]),
    map(NA.head),
  );
};

export const getByPathFolderStrict = <R extends T.Root>(
  root: R,
  path: NormalizedPath,
): Lookup<R | T.NonRootDetails> =>
  pipe(
    getByPathsStrict(root, [path]),
    map(NA.head),
    filterOrElse(
      T.isDetailsG,
      () => ItemIsNotFolderError.create(`${path} is not a folder.`),
    ),
  );

export const getByPathFolderStrictTrash = (
  path: NormalizedPath,
): Lookup<T.DetailsTrashRoot | T.NonRootDetails> =>
  pipe(
    getByPathsStrictTrash([path]),
    map(NA.head),
    filterOrElse(
      T.isDetailsG,
      () => ItemIsNotFolderError.create(`${path} is not a folder.`),
    ),
  );

export const getByPathFolderStrictDocwsroot = (
  path: NormalizedPath,
): Lookup<T.DetailsDocwsRoot | T.NonRootDetails> =>
  pipe(
    getCachedDocwsRoot(),
    SRTE.chainW((root) => getByPathFolderStrict(root, path)),
  );

/** Fails if some of the paths are not valid or not folders */
export const getByPathsFoldersStrict = <R extends T.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
): Lookup<NEA<R | T.NonRootDetails>> =>
  pipe(
    getByPathsStrict(root, paths),
    filterOrElse(
      (items): items is NEA<R | T.NonRootDetails> => A.every(T.isDetailsG)(items),
      () => ItemIsNotFolderError.create(`some of the paths are not folders`),
    ),
  );

export const getByPathsFoldersStrictDocwsroot = (
  paths: NEA<NormalizedPath>,
): Lookup<NEA<T.DetailsDocwsRoot | T.NonRootDetails>> =>
  pipe(
    chainCachedDocwsRoot(
      root => getByPathsFoldersStrict(root, paths),
    ),
  );

export const getByPathsFoldersStrictTrash = (
  paths: NEA<NormalizedPath>,
): Lookup<NEA<T.DetailsTrashRoot | T.NonRootDetails>> =>
  pipe(
    chainCachedTrash(
      root => getByPathsFoldersStrict(root, paths),
    ),
  );

export const getByPath = <R extends T.Root>(
  root: R,
  path: NormalizedPath,
): Lookup<V.Result<R>> => {
  return pipe(
    getByPaths(root, [path]),
    map(NA.head),
  );
};

export const getByPathsDocwsroot = (
  paths: NEA<NormalizedPath>,
): Lookup<NEA<V.Result<T.DetailsDocwsRoot>>> => {
  logger.debug("getByPathsDocwsroot");
  return pipe(
    chainCachedDocwsRoot(root => getByPaths(root, paths)),
  );
};

export const getByPathDocwsroot = (
  path: NormalizedPath,
): Lookup<V.Result<T.DetailsDocwsRoot>> => {
  return pipe(
    getByPathsDocwsroot([path]),
    map(NA.head),
  );
};
