import * as A from "fp-ts/Array";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import { DriveLookup } from "../../../icloud-drive";

import { pipe } from "fp-ts/lib/function";
import * as Actions from "../../../icloud-drive/drive-actions";
import { err } from "../../../util/errors";

type Deps = Actions.DepsUpload & Actions.DepsUploadFolder;

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
      Actions.uploadFolder({
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
      Actions.uploadSingleFile({
        overwrite: args.overwrite,
        skipTrash: args["skip-trash"],
        srcpath: args.paths[0],
        dstpath: args.paths[1],
      }),
      SRTE.map(() => `File uploaded.\n`),
    );
  } else {
    return pipe(
      Actions.uploadMany({
        uploadargs: args.paths,
        overwrite: args.overwrite,
        skipTrash: args["skip-trash"],
        dry: args.dry,
      }),
      SRTE.map(() => `Files uploaded.\n`),
    );
  }
};
