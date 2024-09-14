import { pipe } from "fp-ts/lib/function";
import { DepAskConfirmation } from "../../../deps-types";
import { SRA } from "../../../util/types";
import { DriveLookup } from "../..";
import { solvers } from "./conflict-solvers";
import { Deps as DFuncDeps, downloadICloudFilesChunked } from "./download-chunked";
import { Deps as DownloadFolderDeps, downloadFolder } from "./download-folder";
import { filterByIncludeExcludeGlobs, makeDownloadTaskFromTree } from "./download-task";
import { shallowDirMapper } from "./fs-mapper";

export type Deps = DownloadFolderDeps & DFuncDeps & DepAskConfirmation;

type ShallowArgs = {
  path: string;
  dstpath: string;
  dry: boolean;
  chunkSize: number;
  include: string[];
  exclude: string[];
};

/** Download file of files from a directory */
export const downloadShallow = (
  { path, dry, dstpath, chunkSize, include, exclude }: ShallowArgs,
): SRA<DriveLookup.State, Deps, string> => {
  return pipe(
    downloadFolder(
      {
        path,
        dry,
        depth: 0,
        treefilter: makeDownloadTaskFromTree({
          filterFiles: filterByIncludeExcludeGlobs({ include, exclude }),
        }),
        toLocalFileSystemMapper: shallowDirMapper(dstpath),
        conflictsSolver: solvers.resolveConflictsAskEvery,
        // solvers.resolveConflictsOverwrightIfSizeDifferent(
        //   file => file.extension === 'band' && file.zone.endsWith('mobilegarageband'),
        // ),
        downloadFiles: downloadICloudFilesChunked({ chunkSize }),
      },
    ),
  );
};
