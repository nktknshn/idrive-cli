import * as A from "fp-ts/Array";
import { identity, pipe } from "fp-ts/lib/function";
import { getDirectoryStructure } from "../../../util/get-directory-structure";
import { Path, prependPath } from "../../../util/path";
import { DownloadItem, DownloadTask, DownloadTaskMapped } from "./types";

/** Recursively create folders and files */
export const recursiveDirMapper = (
  dstpath: string,
  mapPath: (path: string) => string = identity,
) =>
(ds: DownloadTask): DownloadTaskMapped => {
  const dirstruct = itemsFolderStructure(ds.downloadable.concat(ds.empties));

  return {
    downloadable: ds.downloadable
      .map((downloadItem) => ({
        downloadItem,
        localpath: prependPath(dstpath)(mapPath(downloadItem.path)),
      })),
    empties: ds.empties
      .map((downloadItem) => ({
        downloadItem,
        localpath: prependPath(dstpath)(mapPath(downloadItem.path)),
      })),
    localdirstruct: [
      dstpath,
      ...dirstruct
        .map(p => prependPath(dstpath)(mapPath(p))),
    ],
  };
};

/** All files to a single folder */
export const shallowDirMapper = (dstpath: string) => (ds: DownloadTask): DownloadTaskMapped => ({
  downloadable: ds.downloadable.map(downloadItem => ({
    downloadItem,
    localpath: Path.join(dstpath, Path.basename(downloadItem.path)),
  })),
  empties: ds.empties.map(downloadItem => ({
    downloadItem,
    localpath: Path.join(dstpath, Path.basename(downloadItem.path)),
  })),
  localdirstruct: [dstpath],
});

/** Extracts the folders structure from the download items */
export const itemsFolderStructure = (items: DownloadItem[]) =>
  pipe(
    items,
    A.map(a => a.path),
    getDirectoryStructure,
  );
