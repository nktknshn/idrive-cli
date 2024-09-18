import * as A from "fp-ts/Array";
import { pipe } from "fp-ts/lib/function";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import * as TE from "fp-ts/TaskEither";
import { DepFs } from "../../../deps-types";
import { DriveLookup } from "../..";
import { of } from "../../drive-lookup";
import { applySolutions } from "./conflict-solution";
import { lookForLocalConflicts } from "./download-conflict";
import { executeDownloadTask } from "./download-task";
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
    dry = false,

    toLocalFileSystemMapper,
    conflictsSolver,
    downloadFiles,
    hookDownloadTaskData,
  }: DownloadGenericArgs<TSolverDeps, TDownloadDeps>,
): DriveLookup.Lookup<string, Deps & TSolverDeps & TDownloadDeps> => {
  const downloadFolderTask = pipe(
    of({ args: { dry } }),
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
    SRTE.bindW("solvedTask", ({ mappedTask, conflicts, solutions }) =>
      pipe(
        DriveLookup.of(
          applySolutions(mappedTask, conflicts, solutions, { skipMissingSolution: true }),
        ),
      )),
  );

  return pipe(
    downloadFolderTask,
    SRTE.chainTaskEitherKW(a =>
      hookDownloadTaskData
        ? hookDownloadTaskData(a)
        : TE.right(a)
    ),
    // SRTE.chainFirstIOK(flow(
    //   showDownloadTaskData({ verbose }),
    //   printerIO.print,
    // )),
    SRTE.map(({ solvedTask }) => solvedTask),
    dry
      ? SRTE.map(() => [])
      : SRTE.chainW(executeDownloadTask({
        downloader: downloadFiles,
      })),
    SRTE.map(() => ""),
    // SRTE.map(resultsJson),
    // SRTE.map(JSON.stringify),
  );
};
