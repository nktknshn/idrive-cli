import * as E from "fp-ts/Either";
import * as A from "fp-ts/lib/Array";
import { pipe } from "fp-ts/lib/function";
import * as RT from "fp-ts/lib/ReaderTask";
import * as TE from "fp-ts/lib/TaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import * as Task from "fp-ts/Task";
import { DepFs } from "../../../deps-types";
import { FsStats } from "../../../util/fs";
import { isEnoentError } from "../../../util/fs/is-enoent-error";
import { LocalTreeElement } from "../../../util/localtreeelement";
import { Path } from "../../../util/path";
import { DownloadItemMapped, DownloadTaskMapped } from "./types";

export type Conflict = ConflictExists | ConflictStatsError;

export type ConflictExists = {
  tag: "exists";
  localitem: LocalTreeElement;
  mappedItem: DownloadItemMapped;
};

export type ConflictStatsError = {
  tag: "statserror";
  mappedItem: DownloadItemMapped;
  error: Error;
};

export const isConflictExists = (c: Conflict): c is ConflictExists => c.tag === "exists";
export const isConflictStatsError = (c: Conflict): c is ConflictStatsError => c.tag === "statserror";

export const partitionConflicts = (conflicts: Conflict[]): {
  exists: ConflictExists[];
  statserror: ConflictStatsError[];
} => {
  const exists = pipe(conflicts, A.filter(isConflictExists));
  const statserror = pipe(conflicts, A.filter(isConflictStatsError));

  return { exists, statserror };
};

/** Check if any of the files in the download task are already present on the
 * local filesystem or a path is inaccessible */
export const lookForLocalConflicts = (
  { downloadable, empties }: DownloadTaskMapped,
): RT.ReaderTask<DepFs<"fstat">, Conflict[]> => {
  const remotes = pipe(
    [...downloadable, ...empties],
  );

  return RT.asksReaderTask(({ fs: { fstat } }) =>
    pipe(
      remotes,
      A.map((item) => fstat(item.localpath)),
      A.zip(remotes),
      A.map(handleStatsItem),
      Task.sequenceSeqArray,
      Task.map(RA.toArray),
      Task.map(A.separate),
      Task.map(({ left }) => left),
      RT.fromTask,
    )
  );
};

const handleStatsItem = (
  [stats, item]: (readonly [TE.TaskEither<Error, FsStats>, DownloadItemMapped]),
): TE.TaskEither<Conflict, DownloadItemMapped> =>
  pipe(
    stats,
    TE.match(
      handleError(item),
      handleStats(item),
    ),
  );

const handleError = (mappedItem: DownloadItemMapped) =>
  (error: Error): E.Either<Conflict, DownloadItemMapped> => {
    return isEnoentError(error)
      ? E.right(mappedItem)
      : E.left({ tag: "statserror", mappedItem, error });
  };

const handleStats = (mappedItem: DownloadItemMapped) =>
  (stats: FsStats): E.Either<Conflict, DownloadItemMapped> =>
    E.left(
      {
        tag: "exists",
        mappedItem,
        localitem: {
          type: stats.isDirectory()
            ? "directory" as const
            : "file" as const,
          stats,
          path: mappedItem.localpath,
          name: Path.basename(mappedItem.localpath),
        },
      },
    );

export const showConflict = (conflict: Conflict): string => {
  if (conflict.tag === "exists") {
    return `local file ${conflict.mappedItem.localpath} (${conflict.localitem.stats.size} bytes)`
      + ` conflicts with remote file (${conflict.mappedItem.downloadItem.item.size} bytes)`;
  }

  return `error: ${conflict.error}`;
};
