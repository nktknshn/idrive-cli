import { constVoid, pipe } from "fp-ts/lib/function";
import * as NA from "fp-ts/lib/NonEmptyArray";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import { DepAskConfirmation } from "../../../deps-types";
import { printerIO } from "../../../logging/printerIO";
import { err } from "../../../util/errors";
import { checkFolderExists } from "../../../util/fs/folder-check";
import { normalizePath, normalizePaths } from "../../../util/normalize-path";
import { NEA } from "../../../util/types";
import { DriveLookup } from "../..";
import { solvers } from "./conflict-solvers";
import { type Deps as DFuncDeps, downloadICloudFilesChunked } from "./download-chunked";
import { type Deps as DownloadDeps, downloadGeneric } from "./download-generic";
import { downloadTaskFromFilesPaths } from "./download-task";
import { shallowDirMapper } from "./fs-mapper";

type Args = {
  paths: NEA<string>;
  destpath: string;
  dry: boolean;
  chunkSize: number;
};

export type Deps =
  & DriveLookup.Deps
  & DFuncDeps
  & DepAskConfirmation
  & DownloadDeps;

/** Download files from multiple paths into a folder. Folders will be ignored. */
export const downloadFiles = (
  { paths, destpath, dry, chunkSize }: Args,
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
          updateTime: true,
          toLocalFileSystemMapper: shallowDirMapper(destpath),
          conflictsSolver: solvers.defaultSolver,
          downloadFiles: downloadICloudFilesChunked({ chunkSize }),
        }),
      )
    ),
    SRTE.map(() => "wuhuu"),
  );
};
