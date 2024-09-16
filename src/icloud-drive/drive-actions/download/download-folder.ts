import { pipe } from "fp-ts/lib/function";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";

import { DepFs } from "../../../deps-types";
import { normalizePath } from "../../../util/path";
import { DriveLookup } from "../..";
import { downloadGeneric } from "./download-generic";
import { DownloadFolderArgs } from "./types";

export type Deps =
  & DriveLookup.Deps
  & DepFs<
    | "fstat"
    | "mkdir"
    | "writeFile"
    // to update the atime and mtime of the files
    | "utimes"
  >;

/** Download files from a folder */
export const downloadFolder = <TSolverDeps, TDownloadDeps>(
  {
    path,
    depth,
    dry = false,

    treefilter,
    toLocalFileSystemMapper,
    conflictsSolver,
    downloadFiles,
  }: DownloadFolderArgs<TSolverDeps, TDownloadDeps>,
): DriveLookup.Lookup<string, Deps & TSolverDeps & TDownloadDeps> => {
  return pipe(
    DriveLookup.getFolderTreeByPathFlattenDocwsroot(normalizePath(path), depth),
    SRTE.map(treefilter),
    SRTE.chainW((task) =>
      downloadGeneric({
        task,
        dry,
        toLocalFileSystemMapper,
        conflictsSolver,
        downloadFiles,
      })
    ),
  );
};
