import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/TaskEither";
import { DepAskConfirmation } from "../../../src/deps-types";
import { ConflictExists, conflictExists, solvers } from "../../../src/icloud-drive/drive-actions/download";
import { DownloadItemMapped } from "../../../src/icloud-drive/drive-actions/download";
import { NEA } from "../../../src/util/types";
import { enableDebug } from "../debug";
import * as M from "./../util/mocked-drive";
import { makeConflictExistsFile } from "./helpers";

enableDebug(false);

const solver0 = solvers.defaultSolver({
  skip: false,
  overwrite: false,
  skipSameSizeAndDate: false,
});

const d1 = new Date("2022-02-18T13:49:00Z");

const str0 = M.fakeicloud(
  M.file({ name: "fileinroot.txt" }),
  M.folder({ name: "folder1" })(
    M.file({ name: "file1.txt", dateModified: d1 }),
  ),
);

const file1 = str0.r.c.folder1.c["file1.txt"];

const conflictExists0: NEA<ConflictExists> = [
  makeConflictExistsFile(
    str0.r.c.folder1.c["file1.txt"],
    {
      localpath: "data/file.txt",
      size: file1.d.size,
      mtime: d1,
    },
  ),
];

const always = (value: boolean) => {
  function f(_: { message: string }): TE.TaskEither<Error, boolean>;
  function f(_: { message: string; options: string[] }): TE.TaskEither<Error, string>;
  function f(_: { message: string; options?: string[] }): TE.TaskEither<Error, string | boolean> {
    return TE.right(value);
  }

  return f;
};

const testExpectRes = <T>(exp: (r: T) => void) => (te: TE.TaskEither<Error, T>) =>
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

describe("default solver", () => {
  it("works", () => {
    const te = solver0(conflictExists0)({
      askConfirmation: always(true),
    });

    return pipe(
      te,
      testExpectRes(res => {
        expect(res).toEqual(
          [[conflictExists0[0], "skip"]],
        );
      }),
    )();
  });
});
