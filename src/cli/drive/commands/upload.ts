import * as A from "fp-ts/Array";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import * as TE from "fp-ts/lib/TaskEither";
import { DriveLookup } from "../../../icloud-drive";

import { pipe } from "fp-ts/lib/function";
import * as Actions from "../../../icloud-drive/drive-actions";
import { err } from "../../../util/errors";

export type AskingFunc = (({ message }: { message: string }) => TE.TaskEither<Error, boolean>);

export const upload = (
  args: {
    uploadargs: string[];
    recursive: boolean;
    dry: boolean;
    include: string[];
    exclude: string[];
    // chunkSize: number
    overwrite: boolean;
    "skip-trash": boolean;
  },
): DriveLookup.Lookup<unknown, Actions.DepsUpload & Actions.DepsUploadFolder> => {
  if (!A.isNonEmpty(args.uploadargs)) {
    return DriveLookup.left(err("No files to upload"));
  }

  if (args.uploadargs.length < 2) {
    return DriveLookup.left(err("Missing destination path"));
  }

  if (args.recursive) {
    return pipe(
      Actions.uploadFolder({
        ...args,
        localpath: args.uploadargs[0],
        remotepath: args.uploadargs[1],
        chunkSize: 2,
      }),
      SRTE.map(() => `Folder uploaded.\n`),
    );
  }

  if (args.uploadargs.length == 2) {
    return pipe(
      Actions.uploadSingleFile({
        overwrite: args.overwrite,
        skipTrash: args["skip-trash"],
        srcpath: args.uploadargs[0],
        dstpath: args.uploadargs[1],
      }),
      SRTE.map(() => `File uploaded.\n`),
    );
  } else {
    return pipe(
      Actions.uploadMany({
        uploadargs: args.uploadargs,
        overwrite: args.overwrite,
        skipTrash: args["skip-trash"],
      }),
      SRTE.map(() => `Files uploaded.\n`),
    );
  }
};
