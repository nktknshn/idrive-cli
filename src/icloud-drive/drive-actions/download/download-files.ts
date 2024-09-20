import * as A from "fp-ts/Array";
import { constVoid, flow, pipe } from "fp-ts/lib/function";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import * as TE from "fp-ts/TaskEither";
import { DepAskConfirmation } from "../../../deps-types";
import { printerIO } from "../../../logging/printerIO";
import { err } from "../../../util/errors";
import { checkFolderExists } from "../../../util/fs/folder-check";
import { guardFst } from "../../../util/guards";
import { NormalizedPath, normalizePaths } from "../../../util/normalize-path";
import { NEA } from "../../../util/types";
import { DriveLookup, Types } from "../..";
import { solvers } from "./conflict-solvers";
import { type Deps as DownloadFuncDeps, downloadICloudFilesChunked } from "./download-chunked";
import { type Deps as DownloadDeps, downloadGeneric } from "./download-generic";
import { isEmptyTask, partitionEmpties } from "./download-task";
import { shallowDirMapper } from "./fs-mapper";
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

/** Download files from multiple paths into a folder. Folders will be ignored. */
export const downloadFiles = (
  { paths, destpath, dry, chunkSize, updateTime, verbose, skipSameSizeAndDate, skip, overwrite, lastConfirmation }:
    Args,
): DriveLookup.Lookup<string, Deps> => {
  const npaths = normalizePaths(paths);

  const checkFolder = pipe(
    checkFolderExists(destpath),
    RTE.chainFirst(exists =>
      exists
        ? RTE.of(constVoid())
        : RTE.left(err(`Destination folder does not exist or is not a folder: ${destpath}`))
    ),
  );

  return pipe(
    checkFolder,
    SRTE.fromReaderTaskEither<Deps, Error, boolean, DriveLookup.State>,
    SRTE.chainW(() => downloadTaskFromFilesPaths(npaths)),
    SRTE.chainFirstIOK(
      ({ folders }) =>
        folders.length > 0
          ? printerIO.print(`Skipping folders: ${folders.join(", ")}`)
          : constVoid,
    ),
    SRTE.bindW("deps", () => SRTE.ask<DriveLookup.State, Deps>()),
    SRTE.chainW(({ task, deps }) =>
      pipe(
        downloadGeneric({
          task,
          dry,
          toLocalFileSystemMapper: shallowDirMapper(destpath),
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

export const downloadTaskFromFilesPaths = (
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
