import { flow, pipe } from "fp-ts/lib/function";
import { DepAskConfirmation } from "../../../deps-types";
import { SRA } from "../../../util/types";
import { DriveLookup } from "../..";
import { solvers } from "./conflict-solvers";
import { Deps as DFuncDeps, downloadICloudFilesChunked } from "./download-chunked";
import { Deps as DownloadFolderDeps, downloadFolder } from "./download-folder";
import { filterByIncludeExcludeGlobs, makeDownloadTaskFromTree } from "./download-tree";
import { shallowDirMapper } from "./fs-mapper";
import { hookPrinting } from "./printing";

export type Deps =
  & DownloadFolderDeps
  & DFuncDeps
  & DepAskConfirmation;

type ShallowArgs = {
  path: string;
  dstpath: string;
  dry: boolean;
  chunkSize: number;
  include: string[];
  exclude: string[];
  updateTime: boolean;
  verbose: boolean;
  skipSameSizeAndDate: boolean;
  skip: boolean;
  overwrite: boolean;
};

/** Download files from a directory */
export const downloadShallow = (
  { path, dry, dstpath, chunkSize, include, exclude, updateTime, skipSameSizeAndDate, verbose, skip, overwrite }:
    ShallowArgs,
): SRA<DriveLookup.State, Deps, string> => {
  return pipe(
    downloadFolder(
      {
        path,
        dry,
        depth: 0,
        updateTime,
        treefilter: makeDownloadTaskFromTree({
          filterFiles: filterByIncludeExcludeGlobs({ include, exclude }),
        }),
        toLocalFileSystemMapper: shallowDirMapper(dstpath),
        conflictsSolver: solvers.defaultSolver({
          skipSameSizeAndDate,
          skip,
          overwrite,
        }),
        downloadFiles: downloadICloudFilesChunked({ chunkSize, updateTime }),
        hookDownloadTaskData: flow(
          hookPrinting({ verbose: verbose || dry }),
        ),
      },
    ),
  );
};
