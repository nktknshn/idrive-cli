import { constant } from "fp-ts/lib/function";
import { ConflictExists, DownloadItem } from "../../../src/icloud-drive/drive-actions/download";

export const makeConflictExistsFile = (
  item: DownloadItem,
  localpath: string,
  name: string,
  size: number,
  mtime: Date,
): ConflictExists => ({
  tag: "exists",
  mappedItem: { localpath, downloadItem: item },
  localitem: {
    type: "file",
    path: localpath,
    name,
    stats: { size, mtime, isDirectory: constant(false), isFile: constant(true) },
  },
});

export const makeConflictExistsFolder = (
  item: DownloadItem,
  localpath: string,
  name: string,
  mtime: Date,
): ConflictExists => ({
  tag: "exists",
  mappedItem: { localpath, downloadItem: item },
  localitem: {
    type: "directory",
    path: localpath,
    name,
    stats: { size: 0, mtime, isDirectory: constant(true), isFile: constant(false) },
  },
});
