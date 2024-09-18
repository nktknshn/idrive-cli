import * as A from "fp-ts/lib/Array";
import * as E from "fp-ts/lib/Either";
import { flow, pipe } from "fp-ts/lib/function";
import { fst } from "fp-ts/lib/ReadonlyTuple";
import * as R from "fp-ts/lib/Record";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
import { printerIO } from "../../../logging/printerIO";
import { guardFst } from "../../../util/guards";
import { sizeHumanReadable } from "../../../util/size-human-readable";
import { maxLength, removeTrailingNewlines } from "../../../util/string";
import { makeSolutionRecord } from "./conflict-solution";
import { partitionConflicts } from "./download-conflict";
import { DownloadFileResult, DownloadTaskData } from "./types";
/*

for f in $(cat files.txt); do
  sha256sum $f | tee -a sums.txt
done

*/
export const showDownloadTaskData = ({ verbose = false }) => (data: DownloadTaskData) => {
  let result = "";

  const column = (s: string, n = 20) => s.padEnd(n);

  const downloadCount = data.solvedTask.downloadable.length + data.solvedTask.empties.length;
  const totalSize = data.solvedTask.downloadable.reduce((a, b) => a + b.downloadItem.item.size, 0);
  const maxPathLength = maxLength(data.solvedTask.downloadable.map(a => a.downloadItem.path));

  result += `${column("Files to download:")}${downloadCount}\n`;
  result += `${column("Total size:")}${sizeHumanReadable(totalSize)}\n`;

  if (verbose) {
    if (data.downloadTask.excluded && data.downloadTask.excluded.length > 0) {
      result += "\n";
      result += `Excluded files (${data.downloadTask.excluded.length}):\n`;

      for (const item of data.downloadTask.excluded) {
        result += `${item.path}\n`;
      }
    }

    result += "\nLocal folders to create (if they don't exist):\n";
    for (const dir of data.solvedTask.localdirstruct) {
      result += `${dir}\n`;
    }

    const { exists, statserror } = partitionConflicts(data.conflicts);

    if (exists.length > 0) {
      const maxLocalPathLength = maxLength(exists.map(c => c.mappedItem.localpath));

      const cr = makeSolutionRecord(data.solutions);

      result += "\n";
      result += "Existing local files:\n";

      for (const conflict of exists) {
        const so = R.lookup(conflict.mappedItem.localpath, cr);

        if (O.isSome(so)) {
          result += `${conflict.mappedItem.localpath.padEnd(maxLocalPathLength + 2)} → ${so.value[1]}\n`;
        } else {
          result += `${conflict.mappedItem.localpath.padEnd(maxLocalPathLength + 2)} → ?\n`;
        }
      }
    }

    // if (data.solutions.length > 0) {
    //   result += "\n";
    //   result += "Solutions:\n";

    //   for (const solution of data.solutions) {
    //     result += `${solution[0].mappedItem.localpath} → ${solution[1]}\n`;
    //   }
    // }

    if (statserror.length > 0) {
      result += "\n";
      result += "Stats errors:\n";
      for (const conflict of statserror) {
        result += `Error getting stats for ${conflict.mappedItem.localpath}: ${conflict.error}\n`;
      }
    }

    result += "\n";
    result += "Result:\n";

    for (const { downloadItem, localpath } of data.solvedTask.downloadable) {
      result += `${column(downloadItem.path, maxPathLength + 5)} → ${localpath}\n`;
    }
  }

  return removeTrailingNewlines(result);
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

export const hookPrinting = ({ verbose }: { verbose: boolean }) => (data: DownloadTaskData) => {
  printerIO.print(showDownloadTaskData({ verbose })(data))();
  return TE.right(data);
};
