import * as A from "fp-ts/lib/Array";
import * as E from "fp-ts/lib/Either";
import { flow, pipe } from "fp-ts/lib/function";
import { fst } from "fp-ts/lib/ReadonlyTuple";
import { guardFst } from "../../../util/guards";
import { sizeHumanReadable } from "../../../util/size-human-readable";
import { maxLength } from "../../../util/string";
import { partitionConflicts } from "./download-conflict";
import { DownloadFileResult, DownloadTaskData, DownloadTaskMapped } from "./types";

export const showDownloadTaskData2 = ({ verbose = false }) =>
  (data: DownloadTaskData) => {
    let result = "";

    const column = (s: string, n = 20) => s.padEnd(n);

    const downloadCount = data.solvedTask.downloadable.length + data.solvedTask.empties.length;
    const totalSize = data.solvedTask.downloadable.reduce((a, b) => a + b.downloadItem.item.size, 0);
    const maxPathLength = maxLength(data.solvedTask.downloadable.map(a => a.downloadItem.path));

    result += `${column("Files:")}${downloadCount}\n`;
    result += `${column("Total size:")}${sizeHumanReadable(totalSize)}\n`;

    if (verbose) {
      result += `${column("Local dirs:")}${data.solvedTask.localdirstruct.join("\n")}\n`;
      result += "\n";

      result += "Conflicts:\n";

      const { exists, statserror } = partitionConflicts(data.conflicts);

      if (exists.length > 0) {
        result += "\n";
        result += "Existing files:\n";

        for (const conflict of exists) {
          result += `${conflict.mappedItem.localpath}\n`;
        }
      }

      if (statserror.length > 0) {
        result += "\n";
        result += "Stats errors:\n";
        for (const conflict of statserror) {
          result += `Error getting stats for ${conflict.mappedItem.localpath}: ${conflict.error}\n`;
        }
      }

      result += "\n";
      result += "Result:\n";

      for (const { downloadItem: item, localpath } of data.solvedTask.downloadable) {
        result += `${column(item.path, maxPathLength + 5)} → ${localpath}\n`;
      }

      // result += `${column("Downloadable:")}\n${
      //   data.solvedTask.downloadable.map(({ item: info, localpath }) => `${info.path} into ${localpath}`).join("\n")
      // }`;
    }

    return result;
  };

export const showDownloadTaskData = ({ verbose = false }) =>
  ({ mappedTask, solvedTask }: DownloadTaskData) => {
    return showTask({ verbose })({
      mappedTask,
      solvedTask,
    });
  };

export const showTask = ({ verbose = false }) =>
  ({ mappedTask, solvedTask }: { mappedTask: DownloadTaskMapped; solvedTask: DownloadTaskMapped }): string => {
    if (solvedTask.downloadable.length > 0) {
      if (verbose) {
        return `will be downloaded: \n${
          [
            ...solvedTask.downloadable,
            ...solvedTask.empties,
          ].map(({ downloadItem: info, localpath }) => `${info.path} into ${localpath}`)
            .join(
              "\n",
            )
        }\n\n`
          + `local dirs: ${solvedTask.localdirstruct.join("\n")}`;
      }

      return `${solvedTask.downloadable.length + solvedTask.empties.length} files will be downloaded`;
    }

    return `Nothing to download. ${mappedTask.downloadable.length} files were skipped by conflict solver`;
  };

export const resultsJson = (results: DownloadFileResult[]) => {
  return {
    success: results.filter(flow(fst, E.isRight)).length,
    fail: results.filter(flow(fst, E.isLeft)).length,
    fails: pipe(
      results,
      A.filter(guardFst(E.isLeft)),
      A.map(([err, [_url, path]]) => `${path}: ${err.left}`),
    ),
  };
};
