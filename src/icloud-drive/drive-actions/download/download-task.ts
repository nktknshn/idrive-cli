import * as A from "fp-ts/Array";
import { pipe } from "fp-ts/lib/function";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import { DepFs } from "../../../deps-types";
import { DriveLookup } from "../..";
import { createEmpties, createLocalDirStruct } from "./download-local";
import { DownloadICloudFilesFunc, DownloadItem, DownloadTaskMapped } from "./types";

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
