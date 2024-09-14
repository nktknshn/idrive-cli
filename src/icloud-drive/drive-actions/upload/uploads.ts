import assert from "assert";
import * as A from "fp-ts/Array";
import { constVoid, pipe } from "fp-ts/lib/function";
import * as NA from "fp-ts/lib/NonEmptyArray";
import { isSome } from "fp-ts/lib/Option";
import * as SRTE from "fp-ts/lib/StateReaderTaskEither";
import * as O from "fp-ts/Option";

import { DepAskConfirmation, DepFs } from "../../../deps-types";
import { loggerIO } from "../../../logging/loggerIO";
import { SrteUtils } from "../../../util";
import { assertFileSize } from "../../../util/fs";
import { normalizePath } from "../../../util/normalize-path";
import { Path } from "../../../util/path";
import { runLogging, wrapError } from "../../../util/srte-utils";
import { SRA } from "../../../util/types";
import { DriveLookup, Types } from "../..";
import { DepApiMethod, DriveApiMethods } from "../../drive-api";
import { findInParentFilename, makeDrivewsid } from "../../util/drive-helpers";
import * as GetByPath from "../../util/get-by-path-types";
import { AskingFunc } from "../upload";

export type Deps =
  & DriveLookup.Deps
  & DepApiMethod<"renameItems">
  & DepApiMethod<"moveItemsToTrash">
  & DepApiMethod<"moveItems">
  & DepApiMethod<"uploadFile">
  & DepFs<"fstat">
  & DepAskConfirmation;

/** Upload multiple files to the same folder */
export const uploadMany = (
  { uploadargs, overwrite, skipTrash }: {
    uploadargs: string[];
    overwrite:
      | boolean
      | AskingFunc;
    skipTrash: boolean;
  },
): SRA<DriveLookup.State, Deps, void> => {
  assert(A.isNonEmpty(uploadargs));
  assert(uploadargs.length > 1);

  const dstpath = NA.last(uploadargs);
  const srcpaths = NA.init(uploadargs);

  return pipe(
    DriveLookup.getCachedDocwsRoot(),
    SRTE.bindTo("root"),
    SRTE.bind("dstDetails", ({ root }) => DriveLookup.getByPathFolderStrict(root, normalizePath(dstpath))),
    SRTE.bindW("deps", () => SRTE.ask<DriveLookup.State, Deps>()),
    SRTE.chain(({ dstDetails, deps }) =>
      pipe(
        srcpaths,
        A.map(src =>
          uploadFileToFolder({
            src,
            dstDetails,
            overwrite: overwrite === true
              ? true
              : deps.askConfirmation,
            skipTrash,
          })
        ),
        SRTE.sequenceArray,
      )
    ),
    SRTE.map(constVoid),
  );
};

export const uploadSingleFile = (
  { srcpath, dstpath, overwrite, skipTrash }: {
    srcpath: string;
    dstpath: string;
    overwrite: boolean;
    skipTrash: boolean;
  },
): SRA<DriveLookup.State, Deps, void> => {
  return pipe(
    loggerIO.debug(`uploadSingleFile from ${srcpath} to ${dstpath}`),
    SRTE.fromIO,
    SRTE.bind("src", () => DriveLookup.of(srcpath)),
    SRTE.bind("overwrite", () => SRTE.asks((d: Deps) => overwrite ? true : d.askConfirmation)),
    SRTE.bind("skipTrash", () => SRTE.of(skipTrash)),
    SrteUtils.chainReaderTaskEitherFirstW(({ src }) =>
      assertFileSize({
        minimumSize: 1,
        path: src,
      })
    ),
    SRTE.bindW("dst", () => DriveLookup.getByPathDocwsroot(normalizePath(dstpath))),
    SRTE.chain(handleSingleFileUpload),
    wrapError("uploadSingleFile"),
  );
};

const handleSingleFileUpload = (
  { src, dst, overwrite, skipTrash }: {
    dst: GetByPath.Result<Types.DetailsDocwsRoot>;
    src: string;
    overwrite: boolean | AskingFunc;
    skipTrash: boolean;
  },
): SRA<DriveLookup.State, Deps, void> => {
  // if the target path already exists in icloud drive
  if (dst.valid) {
    const dstitem = GetByPath.pathTarget(dst);

    // if it's a folder
    if (Types.isFolderLike(dstitem)) {
      return uploadFileToFolder({
        src,
        dstDetails: dstitem,
        overwrite,
        skipTrash,
      });
    } // if it's a file
    else {
      return uploadFileToFolder({
        src,
        dstDetails: GetByPath.getLastDetails(dst),
        overwrite,
        skipTrash,
        fname: Types.fileName(dstitem),
      });
    }
  }

  // if the path is a folder with a single missing item
  if (dst.rest.length == 1) {
    // upload and rename
    const dstitem = NA.last(dst.details);
    const fname = NA.head(dst.rest);

    if (Types.isFolderLike(dstitem)) {
      return pipe(
        DriveApiMethods.uploadFile<DriveLookup.State>({
          sourceFilePath: src,
          docwsid: dstitem.docwsid,
          fname,
          zone: dstitem.zone,
        }),
        SRTE.map(constVoid),
      );
    }
  }

  return DriveLookup.errString(`Invalid destination path: ${GetByPath.showGetByPathResult(dst)}`);
};

const uploadFileToFolder = (
  { src, dstDetails, overwrite, skipTrash, fname }: {
    overwrite:
      | boolean
      | AskingFunc;
    dstDetails: Types.DetailsDocwsRoot | Types.NonRootDetails;
    src: string;
    skipTrash: boolean;
    fname?: string;
  },
): SRA<DriveLookup.State, Deps, void> => {
  const uploadFname = fname ?? Path.basename(src);

  const actualFile = pipe(
    findInParentFilename(dstDetails, uploadFname),
    O.filter(Types.isFile),
  );

  if (isSome(actualFile)) {
    if (typeof overwrite === "boolean") {
      if (overwrite) {
        return uploadOverwrighting({
          src,
          dstitem: actualFile.value,
          parent: dstDetails,
          skipTrash,
        });
      } else {
        return SRTE.of(constVoid());
      }
    } else {
      return pipe(
        overwrite({ message: `overwrite ${uploadFname}?` }),
        SRTE.fromTaskEither,
        SRTE.chain(overwrite => uploadFileToFolder({ src, dstDetails, overwrite, skipTrash })),
      );
    }
  }

  return pipe(
    DriveApiMethods.uploadFile<DriveLookup.State>({
      sourceFilePath: src,
      docwsid: dstDetails.docwsid,
      zone: dstDetails.zone,
      fname,
    }),
    SRTE.map(constVoid),
  );
};

const uploadOverwrighting = (
  { src, parent, dstitem, skipTrash }: {
    parent: Types.DetailsDocwsRoot | Types.NonRootDetails;
    dstitem: Types.DriveChildrenItemFile;
    src: string;
    skipTrash: boolean;
  },
): SRA<DriveLookup.State, Deps, void> => {
  return pipe(
    DriveApiMethods.uploadFile<DriveLookup.State>({
      sourceFilePath: src,
      docwsid: parent.docwsid,
      zone: dstitem.zone,
    }),
    SRTE.bindTo("uploadResult"),
    SRTE.bindW("removeResult", () =>
      pipe(
        DriveApiMethods.moveItemsToTrash<DriveLookup.State>({
          items: [dstitem],
          trash: !skipTrash,
        }),
        runLogging(loggerIO.debug(`moving previous file to trash`)),
      )),
    SRTE.chainW(({ uploadResult }) => {
      const drivewsid = makeDrivewsid(uploadResult);
      return pipe(
        DriveApiMethods.renameItems<DriveLookup.State>({
          items: [{
            drivewsid,
            etag: uploadResult.etag,
            name: dstitem.name,
            extension: dstitem.extension,
          }],
        }),
        runLogging(loggerIO.debug(`Renaming new file`)),
        SRTE.map(constVoid),
      );
    }),
    wrapError(`upload ${src}`),
  );
};
