import { identity } from "fp-ts/lib/function";
import { Path, prependPath } from "../../../util/path";
import { itemsFolderStructure } from "./download-task";
import { DownloadTask, DownloadTaskMapped } from "./types";

export const recursiveDirMapper = (
  dstpath: string,
  mapPath: (path: string) => string = identity,
) =>
  (ds: DownloadTask): DownloadTaskMapped => {
    const dirstruct = itemsFolderStructure(ds.downloadable.concat(ds.empties));

    return {
      downloadable: ds.downloadable
        .map((item) => ({
          item,
          localpath: prependPath(dstpath)(mapPath(item.path)),
        })),
      empties: ds.empties
        .map((item) => ({
          item,
          localpath: prependPath(dstpath)(mapPath(item.path)),
        })),
      localdirstruct: [
        dstpath,
        ...dirstruct
          .map(p => prependPath(dstpath)(mapPath(p))),
      ],
    };
  };

/** Download to a folder */
export const shallowDirMapper = (dstpath: string) =>
  (ds: DownloadTask): DownloadTaskMapped => ({
    downloadable: ds.downloadable.map(item => ({
      item,
      localpath: Path.join(dstpath, Path.basename(item.path)),
    })),
    empties: ds.empties.map(item => ({
      item,
      localpath: Path.join(dstpath, Path.basename(item.path)),
    })),
    localdirstruct: [dstpath],
  });
