import { constant } from "fp-ts/lib/function";
import { ConflictExists, DownloadItem } from "../../../src/icloud-drive/drive-actions/download";
import { Path } from "../../../src/util/path";
import * as M from "./../util/mocked-drive";

export const makeConflictExistsFile = (
  item: DownloadItem | M.ChildFile,
  local: { localpath: string; name?: string; size: number; mtime: Date },
): ConflictExists => ({
  tag: "exists",
  mappedItem: {
    localpath: local.localpath,
    downloadItem: "d" in item
      ? ({
        item: item.d,
        path: item.path,
      })
      : item,
  },
  localitem: {
    type: "file",
    path: local.localpath,
    name: local.name ?? Path.basename(local.localpath),
    stats: { size: local.size, mtime: local.mtime, isDirectory: constant(false), isFile: constant(true) },
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
