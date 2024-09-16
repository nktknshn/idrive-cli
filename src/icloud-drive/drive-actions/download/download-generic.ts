import * as A from "fp-ts/Array";
import { flow, pipe } from "fp-ts/lib/function";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import { DepFs } from "../../../deps-types";
import { printerIO } from "../../../logging/printerIO";
import { DriveLookup } from "../..";
import { of } from "../../drive-lookup";
import { applySolutions } from "./conflict-solution";
import { lookForLocalConflicts } from "./download-conflict";
import { executeDownloadTask } from "./download-task";
import { showDownloadTaskData2 } from "./printing";
import { DownloadGenericArgs } from "./types";

export type Deps =
  & DriveLookup.Deps
  & DepFs<
    | "fstat"
    | "mkdir"
    | "writeFile"
    // to update the atime and mtime of the files
    | "utimes"
  >;

export const downloadGeneric = <TSolverDeps, TDownloadDeps>(
  {
    task,
    updateTime = false,
    dry = false,

    toLocalFileSystemMapper,
    conflictsSolver,
    downloadFiles,
  }: DownloadGenericArgs<TSolverDeps, TDownloadDeps>,
): DriveLookup.Lookup<string, Deps & TSolverDeps & TDownloadDeps> => {
  const verbose = dry;

  const downloadFolderTask = pipe(
    of({ args: { dry, updateTime } }),
    SRTE.bindW("downloadTask", () => DriveLookup.of(task)),
    // assign a local path to each file
    SRTE.bindW("mappedTask", ({ downloadTask }) =>
      pipe(
        DriveLookup.of(toLocalFileSystemMapper(downloadTask)),
      )),
    // check for conflicts
    SRTE.bindW("conflicts", ({ mappedTask }) =>
      SRTE.fromReaderTaskEither(pipe(
        mappedTask,
        RTE.fromReaderTaskK(lookForLocalConflicts),
      ))),
    // ask for conflict resolution
    SRTE.bindW("solutions", ({ conflicts }) =>
      SRTE.fromReaderTaskEither(pipe(
        conflicts,
        A.matchW(() => RTE.of([]), conflictsSolver),
      ))),
    // resolve conflicts
    SRTE.bindW("solvedTask", ({ mappedTask, solutions }) =>
      pipe(
        DriveLookup.of(
          applySolutions(mappedTask)(solutions),
        ),
      )),
  );

  return pipe(
    downloadFolderTask,
    SRTE.chainFirstIOK(flow(
      showDownloadTaskData2({ verbose }),
      printerIO.print,
    )),
    SRTE.map(({ solvedTask }) => solvedTask),
    dry
      ? SRTE.map(() => [])
      : SRTE.chainW(executeDownloadTask({
        downloader: downloadFiles,
      })),
    // SRTE.map(resultsJson),
    SRTE.map(JSON.stringify),
  );
};
