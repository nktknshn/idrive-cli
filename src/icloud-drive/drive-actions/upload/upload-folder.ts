import * as A from "fp-ts/lib/Array";
import { constant, pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as RTE from "fp-ts/lib/ReaderTaskEither";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import * as NA from "fp-ts/NonEmptyArray";

import { DepFs } from "../../../deps-types";
import { loggerIO } from "../../../logging/loggerIO";
import { printerIO } from "../../../logging/printerIO";
import { err } from "../../../util/errors";
import { walkDirRelative } from "../../../util/fs/walkdir";
import { normalizePath } from "../../../util/normalize-path";
import { Path } from "../../../util/path";
import { SRA } from "../../../util/types";
import { DriveLookup, Types } from "../..";
import { DepApiMethod, DriveApiMethods } from "../../drive-api";
import { findInParentFilename } from "../../util/drive-helpers";
import * as V from "../../util/get-by-path-types";
import { showUploadFolderTask } from "./printing";
import { prependRemotePath, UploadFolderTask, UploadResult } from "./types";
import { createRemoteDirStructure } from "./upload-dir-struct";
import { uploadChunkPar } from "./upload-helpers";
import { makeUploadTaskFromTree } from "./upload-task";

type Args = {
  localpath: string;
  remotepath: string;
  dry: boolean;
  include: string[];
  exclude: string[];
  chunkSize: number;
};

export type Deps =
  & DriveLookup.Deps
  & DepApiMethod<"renameItems">
  & DepApiMethod<"createFolders">
  & DepApiMethod<"downloadBatch">
  & DepApiMethod<"uploadFile">
  & DepFs<"fstat" | "opendir">;

/** Upload a folder recursively. Note: uploading over an existing folder is not allowed currently */
export const uploadFolder = (
  args: Args,
): SRA<DriveLookup.State, Deps, unknown> => {
  return pipe(
    DriveLookup.getByPathDocwsroot(normalizePath(args.remotepath)),
    SRTE.bindTo("dst"),
    SRTE.bind("src", () => SRTE.of(args.localpath)),
    SRTE.bind("args", () => SRTE.of(args)),
    SRTE.chain(handleUploadFolder),
    SRTE.map(() => `Success.`),
  );
};

const handleUploadFolder = (
  { src, dst, args }: {
    src: string;
    dst: V.Result<Types.DetailsDocwsRoot>;
    args: Args;
  },
): SRA<DriveLookup.State, Deps, UploadResult[]> => {
  // source folder name
  const dirname = Path.parse(src).base;

  // paths are relative to the src
  const uploadTask = pipe(
    walkDirRelative(src),
    RTE.map(makeUploadTaskFromTree({
      exclude: args.exclude,
      include: args.include,
    })),
  );

  let dstFolder: Types.Details | undefined = undefined;
  let dstPath: string | undefined = undefined;
  let uploadDirName = dirname;

  if (dst.valid) {
    const t = V.pathTarget(dst);

    if (Types.isFolderLike(t)) {
      // case when `dst` is an existing folder
      // so we create a new folder named `dirname` in `dst`
      // if the folder already exists, return an error
      if (O.isSome(findInParentFilename(t, dirname))) {
        // uploading over an existing folder is not allowed currently
        return SRTE.left(
          err(
            `${args.remotepath} already contains an item named '${dirname}'. Uploading over an existing folder is not allowed currently.`,
          ),
        );
      }

      dstFolder = t;
      dstPath = Path.join(args.remotepath, dirname);
    }
  } else if (dst.rest.length == 1) {
    // case when uploading to /existing/folder/new_folder/
    // create a new folder named `dst.rest[0]` (new_folder) in /existing/folder/
    // and upload the content of src to /existing/folder/new_folder/
    dstFolder = NA.last(dst.details);
    uploadDirName = dst.rest[0];
    dstPath = args.remotepath;
  }

  if (dstFolder === undefined || dstPath === undefined) {
    return SRTE.left(err(`invalid dest location: ${args.remotepath}`));
  }

  if (args.dry) {
    return SRTE.fromReaderTaskEither(pipe(
      uploadTask,
      RTE.chainIOK((task) =>
        pipe(
          task,
          prependRemotePath(dstPath),
          showUploadFolderTask,
          printerIO.print,
        )
      ),
      RTE.map(constant([])),
    ));
  }

  return pipe(
    uploadTask,
    SRTE.fromReaderTaskEither,
    SRTE.chain(uploadToNewFolder({
      dstFolder,
      dirname: uploadDirName,
      src,
      chunkSize: args.chunkSize,
      remotepath: args.remotepath,
    })),
  );
};

const uploadToNewFolder = (
  { dirname, dstFolder, src, chunkSize, remotepath }: {
    dstFolder: Types.DetailsDocwsRoot | Types.DetailsFolder | Types.DetailsAppLibrary;
    dirname: string;
    src: string;
    chunkSize: number;
    remotepath: string;
  },
): (
  task: UploadFolderTask,
) => DriveLookup.Lookup<UploadResult[], Deps> =>
(task: UploadFolderTask) =>
  pipe(
    printerIO.print(`Creating folder ${remotepath}`),
    SRTE.fromIO,
    SRTE.chain(() =>
      DriveApiMethods.createFoldersStrict<DriveLookup.State>({
        names: [dirname],
        destinationDrivewsId: dstFolder.drivewsid,
      })
    ),
    SRTE.bindTo("newFolder"),
    SRTE.bind(
      "pathToDrivewsid",
      ({ newFolder }) =>
        pipe(
          printerIO.print(`Creating dir structure in ${dirname}`),
          SRTE.fromIO,
          SRTE.chain(() =>
            // create folder structure in the new folder
            createRemoteDirStructure(
              NA.head(newFolder).drivewsid,
              task.dirstruct,
            )
          ),
        ),
    ),
    SRTE.chainW(({ pathToDrivewsid }) => {
      return pipe(
        task.uploadable,
        A.map(
          localfile => ({
            remotepath: localfile.remotepath,
            item: {
              ...localfile.item,
              // make the relative local path absolute
              path: Path.join(src, localfile.item.path),
            },
          }),
        ),
        A.chunksOf(chunkSize),
        A.map(chunk =>
          pipe(
            loggerIO.debug(`starting uploading a chunk of ${chunkSize} files`),
            SRTE.fromIO,
            SRTE.chain(() => uploadChunkPar(pathToDrivewsid)(chunk)),
          )
        ),
        A.sequence(SRTE.Applicative),
        SRTE.map(A.flatten),
      );
    }),
  );
