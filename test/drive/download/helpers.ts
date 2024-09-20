import { constant, pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/TaskEither";
import { AskConfirmationFunc } from "../../../src/deps-types/dep-ask-confirmation";
import { ConflictExists, DownloadItem } from "../../../src/icloud-drive/drive-actions/download";
import { Path } from "../../../src/util/path";
import * as M from "./../util/mocked-drive";

export const makeConflictExistsFile = (
  item: DownloadItem | M.ChildFile,
  local: { localpath: string; name?: string; size: number; mtime: Date },
): ConflictExists => ({
  tag: "exists",
  mappedItem: {
    localpath: local.localpath,
    downloadItem: "d" in item
      ? ({
        item: item.d,
        path: item.path,
      })
      : item,
  },
  localitem: {
    type: "file",
    path: local.localpath,
    name: local.name ?? Path.basename(local.localpath),
    stats: { size: local.size, mtime: local.mtime, isDirectory: constant(false), isFile: constant(true) },
  },
});

export const makeConflictExistsFolder = (
  item: DownloadItem,
  localpath: string,
  name: string,
  mtime: Date,
): ConflictExists => ({
  tag: "exists",
  mappedItem: { localpath, downloadItem: item },
  localitem: {
    type: "directory",
    path: localpath,
    name,
    stats: { size: 0, mtime, isDirectory: constant(true), isFile: constant(false) },
  },
});

export const testExpectRes = <T>(exp: (r: T) => void) => (te: TE.TaskEither<Error, T>) =>
  pipe(
    te,
    TE.mapLeft(e => {
      throw e;
    }),
    TE.map(res => {
      exp(res);
      return res;
    }),
  );

export const never = (): AskConfirmationFunc => {
  function f(_: { message: string }): TE.TaskEither<Error, boolean>;
  function f(_: { message: string; options: string[] }): TE.TaskEither<Error, string>;
  function f(_: { message: string; options?: string[] }): TE.TaskEither<Error, string | boolean> {
    console.log(_.message);
    throw new Error("Must not be called");
  }
  return f;
};

export const always = (value: string): AskConfirmationFunc => {
  function f(_: { message: string }): TE.TaskEither<Error, boolean>;
  function f(_: { message: string; options: string[] }): TE.TaskEither<Error, string>;
  function f(_: { message: string; options?: string[] }): TE.TaskEither<Error, string | boolean> {
    return TE.right(value);
  }

  return f;
};

export const array = (values: string[]): AskConfirmationFunc => {
  let index = 0;

  function f(_: { message: string }): TE.TaskEither<Error, boolean>;
  function f(_: { message: string; options: string[] }): TE.TaskEither<Error, string>;
  function f(_: { message: string; options?: string[] }): TE.TaskEither<Error, string | boolean> {
    return TE.right(values[index++]);
  }

  return f;
};
