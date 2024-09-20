import * as A from "fp-ts/Array";
import { pipe } from "fp-ts/lib/function";
import * as NA from "fp-ts/lib/NonEmptyArray";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import micromatch from "micromatch";

import { DriveActions, DriveLookup, Types } from "../../../icloud-drive";
import { err } from "../../../util/errors";
import { npath } from "../../../util/normalize-path";

type Args = {
  paths: string[];
  dry: boolean;
  recursive: boolean;
  overwrite: boolean;
  skip: boolean;
  depth: number;
  include: string[];
  exclude: string[];
  "full-path": boolean;
  "chunk-size": number;
  "no-update-time": boolean;
  "skip-size-date": boolean;
  "no-confirmation": boolean;
  verbose: boolean;
};

export const download = (
  args: Args,
): DriveLookup.Lookup<
  string,
  & DriveActions.DepsDownloadRecursive
  & DriveActions.DepsDownloadFiles
> => {
  const updateTime = !args["no-update-time"];
  const skipSameSizeAndDate = args["skip-size-date"];
  const lastConfirmation = !args["no-confirmation"];

  if (!A.isNonEmpty(args.paths)) {
    return SRTE.left(err("No files to download"));
  }

  if (args.paths.length < 2) {
    return SRTE.left(err("Missing destination path"));
  }

  const destpath = NA.last(args.paths);
  const downloadPaths = A.dropRight(1)(args.paths);

  // case
  // idrive download file1.txt file2.txt ... localdir/
  if (A.isNonEmpty(downloadPaths) && downloadPaths.length > 1) {
    return DriveActions.downloadFiles({
      paths: downloadPaths,
      destpath: destpath,
      chunkSize: args["chunk-size"],
      dry: args.dry,
      verbose: args.verbose,
      overwrite: args.overwrite,
      skip: args.skip,
      skipSameSizeAndDate,
      updateTime,
      lastConfirmation,
    });
  }

  // cases
  // idrive download remotedir/ localdir/
  // idrive download remotefile.txt localdir/

  let path = downloadPaths[0];
  const scan = micromatch.scan(path);

  // handle glob
  if (scan.isGlob) {
    args.include = [scan.input, ...args.include];
    path = scan.base;
  }

  return pipe(
    DriveLookup.getByPathStrictDocwsroot(npath(path)),
    SRTE.chainW(res =>
      Types.isFile(res)
        ? DriveActions.downloadFiles({
          paths: [npath(path)],
          destpath: destpath,
          chunkSize: args["chunk-size"],
          dry: args.dry,
          verbose: args.verbose,
          skipSameSizeAndDate,
          overwrite: args.overwrite,
          skip: args.skip,
          updateTime,
          lastConfirmation,
        })
        : args.recursive
        ? DriveActions.downloadRecursive({
          path: path,
          dstpath: destpath,
          dry: args.dry,
          depth: args.depth,
          include: args.include,
          exclude: args.exclude,
          chunkSize: args["chunk-size"],
          fullPath: args["full-path"],
          skipSameSizeAndDate,
          verbose: args.verbose,
          overwrite: args.overwrite,
          skip: args.skip,
          updateTime,
          lastConfirmation,
        })
        : DriveActions.downloadShallow({
          path: path,
          dstpath: destpath,
          dry: args.dry,
          include: args.include,
          exclude: args.exclude,
          chunkSize: args["chunk-size"],
          skipSameSizeAndDate,
          verbose: args.verbose,
          overwrite: args.overwrite,
          skip: args.skip,
          updateTime,
          lastConfirmation,
        })
    ),
    DriveLookup.usingTempCache,
    SRTE.map(() => ""),
  );
};
