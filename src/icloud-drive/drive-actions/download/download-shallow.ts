import { flow, pipe } from "fp-ts/lib/function";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import * as TE from "fp-ts/TaskEither";
import { DepAskConfirmation } from "../../../deps-types";
import { SRA } from "../../../util/types";
import { DriveLookup } from "../..";
import { solvers } from "./conflict-solvers";
import { Deps as DFuncDeps, downloadICloudFilesChunked } from "./download-chunked";
import { Deps as DownloadFolderDeps, downloadFolder } from "./download-folder";
import { isEmptyTask } from "./download-task";
import { filterByIncludeExcludeGlobs, makeDownloadTaskFromTree } from "./download-tree";
import { shallowDirMapper } from "./fs-mapper";
import { hookAskLastConfirmation, hookPrintTaskData } from "./printing";

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
  lastConfirmation: boolean;
};

/** Download files from a directory */
export const downloadShallow = (
  {
    path,
    dry,
    dstpath,
    chunkSize,
    include,
    exclude,
    updateTime,
    skipSameSizeAndDate,
    verbose,
    skip,
    overwrite,
    lastConfirmation,
  }: ShallowArgs,
): SRA<DriveLookup.State, Deps, string> => {
  return pipe(
    SRTE.ask<DriveLookup.State, Deps>(),
    SRTE.chainW((deps) =>
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
            hookPrintTaskData({ verbose: verbose || dry }),
            TE.chain(td =>
              lastConfirmation && !dry && !isEmptyTask(td.solvedTask)
                ? hookAskLastConfirmation(deps)(td)
                : TE.right(td)
            ),
          ),
        },
      )
    ),
  );
};
