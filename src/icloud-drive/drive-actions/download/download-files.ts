import * as A from "fp-ts/Array";
import { constVoid, pipe } from "fp-ts/lib/function";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
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
import { partitionEmpties } from "./download-task";
import { shallowDirMapper } from "./fs-mapper";
import { DownloadTask } from "./types";

type Args = {
  paths: NEA<string>;
  destpath: string;
  dry: boolean;
  chunkSize: number;
  updateTime: boolean;
};

export type Deps =
  & DriveLookup.Deps
  & DepAskConfirmation
  & DownloadFuncDeps
  & DownloadDeps;

/** Download files from multiple paths into a folder. Folders will be ignored. */
export const downloadFiles = (
  { paths, destpath, dry, chunkSize, updateTime }: Args,
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
    SRTE.chainFirstIOK((files) => printerIO.print(`Downloading ${files.downloadable.map(_ => _.path).join(", ")}`)),
    SRTE.chainW(task =>
      pipe(
        downloadGeneric({
          task,
          dry,
          toLocalFileSystemMapper: shallowDirMapper(destpath),
          conflictsSolver: solvers.defaultSolver,
          downloadFiles: downloadICloudFilesChunked({ chunkSize, updateTime }),
        }),
      )
    ),
  );
};

export const downloadTaskFromFilesPaths = (
  npaths: NEA<NormalizedPath>,
): DriveLookup.Lookup<DownloadTask> => {
  return pipe(
    DriveLookup.getByPathsStrictDocwsroot(npaths),
    SRTE.map(A.zip(npaths)),
    SRTE.map(A.filter(guardFst(Types.isFile))),
    SRTE.map(A.map(([item, path]) => ({ path, item }))),
    SRTE.map(partitionEmpties),
  );
};
