import { flow } from "fp-ts/lib/function";
import micromatch from "micromatch";
import { DepAskConfirmation } from "../../../deps-types";
import { Path } from "../../../util/path";
import { DriveLookup } from "../..";
import { solvers } from "./conflict-solvers";
import { Deps as DFuncDeps, downloadICloudFilesChunked } from "./download-chunked";
import { Deps as DownloadFolderDeps, downloadFolder } from "./download-folder";
import { filterByIncludeExcludeGlobs, makeDownloadTaskFromTree } from "./download-tree";
import { recursiveDirMapper } from "./fs-mapper";
import { hookPrinting } from "./printing";

export type Deps = DownloadFolderDeps & DFuncDeps & DepAskConfirmation;

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
};

/** recursively download files */
export const downloadRecursive = (
  args: RecursiveArgs,
): DriveLookup.Lookup<string, Deps> => {
  const dirname = Path.dirname(micromatch.scan(args.path).base);

  return downloadFolder(
    {
      ...args,
      treefilter: makeDownloadTaskFromTree({
        filterFiles: filterByIncludeExcludeGlobs(args),
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
        hookPrinting({ verbose: args.verbose || args.dry }),
      ),
    },
  );
};
