import child_process from "child_process";
import { randomUUID } from "crypto";
import * as E from "fp-ts/Either";
import { constVoid, pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as R from "fp-ts/lib/Reader";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import * as S from "fp-ts/lib/string";

import { DepFetchClient, DepFs } from "../../deps-types";
import { loggerIO } from "../../logging/loggerIO";
import { err, FileInvalidError, FileNotFoundError } from "../../util/errors";
import { assertFileSize, FsError } from "../../util/fs";
import { calculateFileHashO } from "../../util/fs/file-hash";
import { AssetFileSizeError, FileSizeError } from "../../util/fs/size-check";
import { downloadUrlToFile } from "../../util/http/downloadUrlToFile";
import { normalizePath } from "../../util/normalize-path";
import { Path } from "../../util/path";
import * as SrteUtils from "../../util/srte-utils";
import { DriveLookup, GetByPath, Types } from "..";
import { DepApiMethod, DriveApiMethods } from "../drive-api";
import * as Actions from ".";

type DepTempDir = { tempdir: string };

export type Deps =
  & DriveLookup.Deps
  & DepApiMethod<"download">
  & Actions.DepsUpload
  & DepFs<"fstat" | "createWriteStream" | "createReadStream" | "rm">
  & DepFetchClient
  & DepTempDir;

// TODO add Editor interface

type Result = "canceled" | "success" | "not-modified";

export const edit = (
  { path, editor }: { path: string; editor: string },
): DriveLookup.Lookup<Result, Deps> => {
  const npath = pipe(path, normalizePath);

  const tempFile = ({ tempdir }: Deps) =>
    Path.join(
      tempdir,
      Path.basename(npath) + "." + randomUUID().substring(0, 16),
    );

  const doUpload = ({ sizeCheck, hash1, hash2 }: {
    sizeCheck: E.Either<AssetFileSizeError, void>;
    hash1: O.Option<string>;
    hash2: O.Option<string>;
  }): E.Either<FsError | FileInvalidError, Result> => {
    if (E.isLeft(sizeCheck) && sizeCheck.left) {
      // new file was not saved
      if (FileNotFoundError.is(sizeCheck.left)) {
        return E.right("canceled");
      }

      // file is empty
      if (FileSizeError.is(sizeCheck.left)) {
        return E.right("canceled");
      }

      // other error
      return E.left(sizeCheck.left);
    }

    // file is not modified
    if (O.getEq(S.Eq).equals(hash1, hash2)) {
      return E.right("not-modified");
    }

    return E.right("success");
  };

  return pipe(
    DriveLookup.getByPathDocwsroot(npath),
    SRTE.bindTo("gbp"),
    SRTE.bind("tempfile", () => SRTE.fromReader(R.asks(tempFile))),
    SRTE.bind("handleResult", handle),
    SRTE.bind("fs", () => SRTE.asks(({ fs }) => fs)),
    SRTE.bindW("hash1", ({ tempfile }) => SRTE.fromReaderTaskEither(calculateFileHashO(tempfile))),
    SRTE.bind("signal", ({ tempfile }) => SRTE.fromTask(spawnVim({ editor, tempfile }))),
    SRTE.bindW(
      "sizeCheck",
      ({ tempfile }) => SrteUtils.fromReaderTask(assertFileSize({ path: tempfile, minimumSize: 1 })),
    ),
    SRTE.bindW("hash2", ({ tempfile }) => SRTE.fromReaderTaskEither(calculateFileHashO(tempfile))),
    SRTE.bindW("checks", (a) => SRTE.fromEither(doUpload(a))),
    SRTE.chainW(({ tempfile, fs, checks }) =>
      pipe(
        checks === "success"
          ? Actions.uploadSingleFile({
            overwrite: true,
            srcpath: tempfile,
            dstpath: npath,
            skipTrash: false,
          })
          : SRTE.of(constVoid()),
        SRTE.map(() => checks),
        SRTE.chainFirst(() =>
          SrteUtils.runLogging(
            loggerIO.debug(`removing temp file ${tempfile}`),
          )(
            SRTE.fromTaskEither(fs.rm(tempfile, { force: true })),
          )
        ),
      )
    ),
  );
};

// if successful dstpath is the file to upload
// two valid cases:
// 1. file exists
// 2. we have an invalid path with a single missing item
const handle = (
  { tempfile, gbp }: { tempfile: string; gbp: GetByPath.ResultRoot },
): DriveLookup.Lookup<void, Deps> => {
  if (GetByPath.isInvalidPath(gbp)) {
    if (gbp.rest.length > 1) {
      return DriveLookup.errString(`Invalid path: ${GetByPath.pathString(gbp)}.`);
    }

    return handleMeowFile(tempfile);
  }

  if (GetByPath.isValidFolder(gbp)) {
    return DriveLookup.errString(`You cannot edit a directory.`);
  }

  if (GetByPath.isValidFile(gbp)) {
    return handleExistingFile(tempfile, gbp.file);
  }

  return gbp;
};

/** Download a file to a temp file */
const handleExistingFile = (tempfile: string, item: Types.DriveChildrenItemFile): DriveLookup.Lookup<void, Deps> => {
  return pipe(
    DriveApiMethods.getDriveItemUrl<DriveLookup.State>(item),
    SRTE.map(O.fromNullable),
    SRTE.chain(a => SRTE.fromOption(() => err(`Empty file url was returned.`))(a)),
    SRTE.chainW(url => SRTE.fromReaderTaskEither(downloadUrlToFile(url, tempfile))),
    SRTE.map(constVoid),
  );
};

const handleMeowFile = (_tempfile: string): DriveLookup.Lookup<void, Deps> => {
  return pipe(
    SRTE.of(constVoid()),
  );
};

const spawnVim = ({ tempfile, editor }: { tempfile: string; editor: string }) =>
  (): Promise<NodeJS.Signals | null> => {
    return new Promise(
      (resolve, reject) => {
        child_process
          .spawn(editor, [tempfile], {
            stdio: "inherit",
          })
          .on("close", (code, signal) => {
            if (code === 0) {
              return resolve(signal);
            }
            return reject(code);
          });
      },
    );
  };
