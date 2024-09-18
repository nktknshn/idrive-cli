import * as R from "fp-ts/lib/Record";
import { AuthenticatedState } from "../../../icloud-core/icloud-request";
import { DriveTree, Types } from "../..";

import { DownloadFileResult } from "../../../util/http/download-url-to-file";
import { SRA } from "../../../util/types";
import { ConflictsSolver, Solution } from "./conflict-solution";
import { Conflict } from "./download-conflict";

/** Remote file to download */
export type DownloadItem = {
  /** remote path */
  path: string;
  item: Types.DriveChildrenItemFile;
};

/** Represents a single download task */
export type DownloadTask = {
  // /** structure of the remote folders containing the files*/
  // dirstruct: string[];
  /** items to download */
  downloadable: DownloadItem[];
  /** empty undownloadable files to create */
  empties: DownloadItem[];
};

/** Remote file with local path specified */
export type DownloadItemMapped = {
  downloadItem: DownloadItem;
  localpath: string;
};

/** Convert array of mapped items to a record grouped by localpath */
export const mappedArrayToRecord = (
  mapped: DownloadItemMapped[],
): Record<string, DownloadItemMapped> => R.fromEntries(mapped.map(m => [m.localpath, m]));

/** Represents a download task with local paths specified */
export type DownloadTaskMapped = {
  localdirstruct: string[];
  downloadable: DownloadItemMapped[];
  empties: DownloadItemMapped[];
};

/** Function to download a batch of files */
export type DownloadICloudFilesFunc<R> = <S extends AuthenticatedState>(
  task: { downloadable: DownloadItemMapped[] },
  // updateTime?: boolean,
) => SRA<S, R, DownloadFileResult[]>;

/** Arguments for downloading a folder */
export type Args = {
  path: string;
  depth: number;
  dry: boolean;
  updateTime: boolean;
};

export type DownloadGenericArgs<TSolverDeps, TDownloadDeps> = {
  dry: boolean;
  /** filters the tree picking files that will be downloaded */
  task: DownloadTask;
  /** decides where to download the files to */
  toLocalFileSystemMapper: (ds: DownloadTask) => DownloadTaskMapped;
  /** provides strategy to resolve conflicts and errors. Like overwrite, skip, etc. */
  conflictsSolver: ConflictsSolver<TSolverDeps>;
  /** downloads files from the cloud */
  downloadFiles: DownloadICloudFilesFunc<TDownloadDeps>;
};

export type DownloadFolderArgs<TSolverDeps, TDownloadDeps> =
  & Args
  & {
    /** filters the tree picking files that will be downloaded */
    treefilter: <T extends Types.Root>(
      flatTree: DriveTree.FlattenWithItems<T>,
    ) => DownloadTask & { excluded: DownloadItem[] };
    /** decides where to download the files to */
    toLocalFileSystemMapper: (ds: DownloadTask) => DownloadTaskMapped;
    /** provides strategy to resolve conflicts and errors. Like overwrite, skip, etc. */
    conflictsSolver: ConflictsSolver<TSolverDeps>;
    /** downloads files from the cloud */
    downloadFiles: DownloadICloudFilesFunc<TDownloadDeps>;
  };

/** Accumulated download task data */
export type DownloadTaskData = {
  // filtered items
  downloadTask: DownloadTask & { excluded?: DownloadItem[] };
  // mapped items
  mappedTask: DownloadTaskMapped;
  // conflicts with the local filesystem
  conflicts: Conflict[];
  solutions: Solution[];
  // resulting download task
  solvedTask: DownloadTaskMapped;
};

export { type DownloadFileResult };
