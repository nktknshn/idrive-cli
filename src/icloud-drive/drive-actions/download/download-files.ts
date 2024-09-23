import * as A from "fp-ts/Array";
import { constVoid, flow, pipe } from "fp-ts/lib/function";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import * as TE from "fp-ts/TaskEither";

import { DepAskConfirmation } from "../../../deps-types";
import { printerIO } from "../../../logging/printerIO";
import { err } from "../../../util/errors";
import { checkPath, CheckPathResult } from "../../../util/fs/folder-check";
import { guardFst } from "../../../util/guards";
import { NormalizedPath, normalizePaths } from "../../../util/normalize-path";
import { NEA } from "../../../util/types";
import { DriveLookup, Types } from "../..";
import { solvers } from "./conflict-solvers";
import { type Deps as DownloadFuncDeps, downloadICloudFilesChunked } from "./download-chunked";
import { type Deps as DownloadDeps, downloadGeneric } from "./download-generic";
import { isEmptyTask, partitionEmpties } from "./download-task";
import { shallowDirMapper, singleFileMapper } from "./fs-mapper";
import { hookAskLastConfirmation, hookPrintTaskData } from "./printing";
import { DownloadTask } from "./types";

type Args = {
  paths: NEA<string>;
  destpath: string;
  dry: boolean;
  chunkSize: number;
  updateTime: boolean;
  verbose: boolean;
  skipSameSizeAndDate: boolean;
  overwrite: boolean;
  skip: boolean;
  lastConfirmation: boolean;
};

export type Deps =
  & DriveLookup.Deps
  & DepAskConfirmation
  & DownloadFuncDeps
  & DownloadDeps;

/** Download files from multiple paths into a folder. Or a single file into a folder/file. Folders will be ignored. */
export const downloadFiles = (
  { paths, destpath, dry, chunkSize, updateTime, verbose, skipSameSizeAndDate, skip, overwrite, lastConfirmation }:
    Args,
): DriveLookup.Lookup<string, Deps> => {
  const npaths = normalizePaths(paths);

  const isMutipleFiles = paths.length > 1;
  const isSingleFile = paths.length == 1;

  // TODO handle case when destpath has a trailing slash (it is supposed to be a folder)
  // const destPathMustBeFolder = destpath.endsWith("/");
  const validateCheck = (check: CheckPathResult) =>
    // multiple files requires the folder to exist
    isMutipleFiles && check.exists && check.isFolder
      ? RTE.of(constVoid())
      // single file requires the folder/file to exist
      // or the last part of the path may not exist
      : isSingleFile && (
          // folder/file exists or parent folder exists
          check.exists || (check.parentExists && check.parentStats?.isDirectory())
        )
      ? RTE.of(constVoid())
      : RTE.left(err(`Invalid destionation path: ${destpath}`));

  return pipe(
    checkPath(destpath),
    SRTE.fromReaderTaskEither<Deps, Error, CheckPathResult, DriveLookup.State>,
    SRTE.chainFirstW(a => SRTE.fromReaderTaskEitherK(validateCheck)(a)),
    SRTE.bindTo("check"),
    SRTE.bindW("task", () => makeDownloadTaskFromFilesPaths(npaths)),
    SRTE.chainFirstIOK(
      ({ task }) =>
        task.folders.length > 0
          ? printerIO.print(`Skipping folders: ${task.folders.join(", ")}`)
          : constVoid,
    ),
    SRTE.bindW("deps", () => SRTE.ask<DriveLookup.State, Deps>()),
    SRTE.chainW(({ task: { task }, deps, check }) =>
      pipe(
        downloadGeneric({
          task,
          dry,
          toLocalFileSystemMapper: isSingleFile
            ? singleFileMapper(
              destpath,
              // append filename if the dest path is a folder
              check.exists && check.isFolder,
            )
            : shallowDirMapper(destpath),
          conflictsSolver: solvers.defaultSolver({ skipSameSizeAndDate, skip, overwrite }),
          downloadFiles: downloadICloudFilesChunked({ chunkSize, updateTime }),
          hookDownloadTaskData: flow(
            hookPrintTaskData({ verbose: verbose || dry }),
            TE.chain(td =>
              lastConfirmation && !dry && !isEmptyTask(td.solvedTask)
                ? hookAskLastConfirmation(deps)(td)
                : TE.right(td)
            ),
          ),
        }),
      )
    ),
  );
};

export const makeDownloadTaskFromFilesPaths = (
  npaths: NEA<NormalizedPath>,
): DriveLookup.Lookup<{ task: DownloadTask; folders: string[] }> => {
  return pipe(
    DriveLookup.getByPathsStrictDocwsroot(npaths),
    SRTE.map(A.zip(npaths)),
    SRTE.map((results) => {
      const folders = pipe(
        results,
        A.filter(guardFst(Types.isFolderLike)),
        A.map(([_, path]) => path),
      );

      const files = pipe(
        results,
        A.filter(guardFst(Types.isFile)),
        A.map(([item, path]) => ({ path, item })),
      );

      const task = pipe(
        files,
        partitionEmpties,
      );

      return { task, folders };
    }),
  );
};
