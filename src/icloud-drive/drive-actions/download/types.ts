// import * as RTE from "fp-ts/lib/ReaderTaskEither";
import { AuthenticatedState } from "../../../icloud-core/icloud-request";
import { Types } from "../..";

import { DownloadFileResult } from "../../../util/http/downloadUrlToFile";
import { SRA } from "../../../util/types";

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
  item: DownloadItem;
  localpath: string;
};

/** Represents a download task with local paths specified */
export type DownloadTaskMapped = {
  localdirstruct: string[];
  downloadable: DownloadItemMapped[];
  empties: DownloadItemMapped[];
};

/** Function to download a batch of files */
export type DownloadICloudFilesFunc<R> = <S extends AuthenticatedState>(
  task: { downloadable: DownloadItemMapped[] },
) => SRA<S, R, DownloadFileResult[]>;

export { type DownloadFileResult };
