import * as A from "fp-ts/Array";
import { pipe } from "fp-ts/lib/function";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import { DriveActions, DriveLookup } from "idrive-lib";

import { err } from "idrive-lib/util/errors";

type Deps =
  & DriveActions.DepsUpload
  & DriveActions.DepsUploadFolder;

export const upload = (
  args: {
    paths: string[];
    recursive: boolean;
    dry: boolean;
    include: string[];
    exclude: string[];
    // chunkSize: number
    overwrite: boolean;
    "skip-trash": boolean;
  },
): DriveLookup.Lookup<string, Deps> => {
  if (!A.isNonEmpty(args.paths)) {
    return SRTE.left(err("No files to upload"));
  }

  if (args.paths.length < 2) {
    return SRTE.left(err("Missing destination path"));
  }

  if (args.recursive) {
    return pipe(
      DriveActions.uploadFolder({
        ...args,
        localpath: args.paths[0],
        remotepath: args.paths[1],
        chunkSize: 2,
      }),
      SRTE.map(() => args.dry ? `Folder uploaded.\n` : ``),
    );
  }

  if (args.paths.length == 2) {
    return pipe(
      DriveActions.uploadSingleFile({
        overwrite: args.overwrite,
        skipTrash: args["skip-trash"],
        srcpath: args.paths[0],
        dstpath: args.paths[1],
      }),
      SRTE.map(() => `File uploaded.\n`),
    );
  } else {
    return pipe(
      DriveActions.uploadMany({
        uploadargs: args.paths,
        overwrite: args.overwrite,
        skipTrash: args["skip-trash"],
        dry: args.dry,
      }),
      SRTE.map(() => `Files uploaded.\n`),
    );
  }
};
