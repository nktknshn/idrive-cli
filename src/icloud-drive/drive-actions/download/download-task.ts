import * as A from "fp-ts/Array";
import { pipe } from "fp-ts/lib/function";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import { DepFs } from "../../../deps-types";
import { guardFst } from "../../../util/guards";
import { NormalizedPath } from "../../../util/normalize-path";
import { NEA } from "../../../util/types";
import { DriveLookup, Types } from "../..";
import { createEmpties, createLocalDirStruct } from "./download-local";
import { DownloadICloudFilesFunc, DownloadItem, DownloadTask, DownloadTaskMapped } from "./types";

/** Create directories and empty files */
export const prepareLocalFs = (task: DownloadTaskMapped) =>
  pipe(
    SRTE.fromReaderTaskEither<DepFs<"mkdir" | "writeFile">, Error, void, DriveLookup.State>(
      pipe(
        createLocalDirStruct(task.localdirstruct),
        RTE.chainW(() => createEmpties(task)),
      ),
    ),
  );

/** Run the download task */
export const executeDownloadTask = <TDownloadDeps>(
  { downloader }: { downloader: DownloadICloudFilesFunc<TDownloadDeps> },
) =>
(task: DownloadTaskMapped) =>
  pipe(
    // create local directories and empty files
    prepareLocalFs(task),
    // download files
    SRTE.chainW(() => downloader(task)),
  );

export const partitionEmpties = (
  items: DownloadItem[],
) =>
  pipe(
    items,
    A.partition(({ item }) => item.size == 0),
    _ => ({ downloadable: _.left, empties: _.right }),
  );

export const downloadTaskFromFilesPaths = (
  npaths: NEA<NormalizedPath>,
): DriveLookup.Lookup<DownloadTask> => {
  return pipe(
    DriveLookup.getByPathsStrictDocwsroot(npaths),
    SRTE.map(A.zip(npaths)),
    SRTE.map(A.filter(guardFst(Types.isFile))),
    SRTE.map(A.map(([f, p]): DownloadItem => ({
      path: p,
      item: f,
    }))),
    SRTE.map(partitionEmpties),
  );
};
