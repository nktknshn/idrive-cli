import { flow, pipe } from "fp-ts/lib/function";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import * as TE from "fp-ts/TaskEither";
import micromatch from "micromatch";
import { DepAskConfirmation } from "../../../deps-types";
import { Path } from "../../../util/path";
import { DriveLookup } from "../..";
import { solvers } from "./conflict-solvers";
import { Deps as DepsDownloadFunc, downloadICloudFilesChunked } from "./download-chunked";
import { Deps as DepsDownloadFolder, downloadFolder } from "./download-folder";
import { isEmptyTask } from "./download-task";
import { filterByIncludeExcludeGlobs, makeDownloadTaskFromTree } from "./download-tree";
import { recursiveDirMapper } from "./fs-mapper";
import { hookAskLastConfirmation, hookPrintTaskData } from "./printing";

export type Deps =
  & DepsDownloadFolder
  & DepsDownloadFunc
  & DepAskConfirmation;

export type RecursiveArgs = {
  path: string;
  dstpath: string;
  dry: boolean;
  include: string[];
  exclude: string[];
  // rename to full path
  fullPath: boolean;
  chunkSize: number;
  updateTime: boolean;
  skipSameSizeAndDate: boolean;
  depth: number;
  verbose: boolean;
  overwrite: boolean;
  skip: boolean;
  lastConfirmation: boolean;
};

/** recursively download files */
export const downloadRecursive = (
  args: RecursiveArgs,
): DriveLookup.Lookup<string, Deps> => {
  const dirname = Path.dirname(micromatch.scan(args.path).base);

  return pipe(
    SRTE.ask<DriveLookup.State, Deps>(),
    SRTE.chainW((deps) =>
      downloadFolder(
        {
          path: args.path,
          dry: args.dry,
          depth: args.depth,
          updateTime: args.updateTime,
          treefilter: makeDownloadTaskFromTree({
            filterFiles: filterByIncludeExcludeGlobs({
              include: args.include,
              exclude: args.exclude,
            }),
          }),
          toLocalFileSystemMapper: args.fullPath
            ? recursiveDirMapper(args.dstpath)
            : recursiveDirMapper(
              args.dstpath,
              p => p.substring(dirname.length),
            ),
          conflictsSolver: cfs =>
            solvers.defaultSolver({
              skipSameSizeAndDate: args.skipSameSizeAndDate,
              skip: args.skip,
              overwrite: args.overwrite,
            })(cfs),
          // cfs.length > 10
          //   ? solvers.askAll(cfs)
          //   : solvers.askEvery(cfs),
          downloadFiles: downloadICloudFilesChunked({ chunkSize: args.chunkSize }),
          hookDownloadTaskData: flow(
            hookPrintTaskData({ verbose: args.verbose || args.dry }),
            TE.chain(td =>
              args.lastConfirmation && !args.dry && !isEmptyTask(td.solvedTask)
                ? hookAskLastConfirmation(deps)(td)
                : TE.right(td)
            ),
          ),
        },
      )
    ),
  );
};
