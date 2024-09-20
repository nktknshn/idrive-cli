import { pipe } from "fp-ts/lib/function";
import { DepAskConfirmation } from "../../../src/deps-types";
import { AskConfirmationFunc } from "../../../src/deps-types/dep-ask-confirmation";
import { Conflict, ConflictsSolver, Solution, solvers } from "../../../src/icloud-drive/drive-actions/download";
import { NEA } from "../../../src/util/types";
import { enableDebug } from "../debug";
import * as M from "./../util/mocked-drive";
import { always, array, makeConflictExistsFile, never, testExpectRes } from "./helpers";

enableDebug(false);

const file1mtime = new Date("2022-02-18T13:49:00Z");
const file2mtime = new Date("2021-01-10T13:49:00Z");

const str0 = M.fakeicloud(
  M.file({ name: "fileinroot.txt" }),
  M.folder({ name: "folder1" })(
    M.file({ name: "file1.txt", dateModified: file1mtime }),
    M.file({ name: "file2.txt", dateModified: file2mtime }),
    M.file({ name: "file3.txt", dateModified: file2mtime }),
  ),
);

const file1 = M.getByPathFile("/folder1/file1.txt", str0.r);
const file2 = M.getByPathFile("/folder1/file2.txt", str0.r);
const file3 = M.getByPathFile("/folder1/file3.txt", str0.r);

// same size and date
const conflictExists0 = makeConflictExistsFile(
  file1,
  { localpath: "data/file.txt", size: file1.d.size, mtime: file1mtime },
);

// different size and date
const conflictExists1 = makeConflictExistsFile(
  file2,
  { localpath: "data/file.txt", size: 666, mtime: file2mtime },
);

// different size and date
const conflictExists3 = makeConflictExistsFile(
  file3,
  { localpath: "data/file.txt", size: 666, mtime: file2mtime },
);

type Test = {
  s: ConflictsSolver<DepAskConfirmation>;
  cs: NEA<Conflict>;
  a: AskConfirmationFunc;
  e: Solution[];
};

const solverAlwaysAsk = solvers.defaultSolver({
  skip: false,
  overwrite: false,
  skipSameSizeAndDate: false,
});

const solverSkip = solvers.defaultSolver({
  skip: true,
  overwrite: false,
  skipSameSizeAndDate: false,
});

const solverOverwrite = solvers.defaultSolver({
  skip: false,
  overwrite: true,
  skipSameSizeAndDate: false,
});

const tests: Test[] = [
  // ask for confirmation
  {
    s: solverAlwaysAsk,
    cs: [conflictExists0, conflictExists1],
    a: always("yes"),
    e: [[conflictExists0, "overwrite"], [conflictExists1, "overwrite"]],
  },
  {
    s: solverAlwaysAsk,
    cs: [conflictExists0, conflictExists1],
    a: always("no"),
    e: [[conflictExists0, "skip"], [conflictExists1, "skip"]],
  },
  {
    s: solverAlwaysAsk,
    cs: [conflictExists0, conflictExists1],
    a: array(["yes", "no"]),
    e: [[conflictExists0, "overwrite"], [conflictExists1, "skip"]],
  },
  {
    s: solvers.defaultSolver({ skip: false, overwrite: false, skipSameSizeAndDate: true }),
    cs: [conflictExists0],
    a: never(),
    e: [[conflictExists0, "skip"]],
  },
  {
    s: solverSkip,
    cs: [conflictExists0, conflictExists1],
    a: never(),
    e: [[conflictExists0, "skip"], [conflictExists1, "skip"]],
  },
  {
    s: solverOverwrite,
    cs: [conflictExists0, conflictExists1],
    a: never(),
    e: [[conflictExists0, "overwrite"], [conflictExists1, "overwrite"]],
  },
  {
    s: solvers.defaultSolver({ skip: true, overwrite: true, skipSameSizeAndDate: true }),
    cs: [conflictExists0, conflictExists1],
    a: never(),
    e: [[conflictExists0, "skip"], [conflictExists1, "skip"]],
  },
  {
    s: solvers.defaultSolver({ skip: true, overwrite: true, skipSameSizeAndDate: false }),
    cs: [conflictExists0, conflictExists1],
    a: never(),
    e: [[conflictExists0, "skip"], [conflictExists1, "skip"]],
  },
  {
    s: solvers.defaultSolver({ skip: false, overwrite: true, skipSameSizeAndDate: true }),
    cs: [conflictExists0, conflictExists1],
    a: array(["yes"]),
    e: [[conflictExists0, "skip"], [conflictExists1, "overwrite"]],
  },
  // yes for all
  {
    s: solvers.defaultSolver({ skip: false, overwrite: false, skipSameSizeAndDate: false }),
    cs: [conflictExists0, conflictExists1],
    a: array(["yes for all"]),
    e: [[conflictExists0, "overwrite"], [conflictExists1, "overwrite"]],
  },
  // no for all
  {
    s: solvers.defaultSolver({ skip: false, overwrite: false, skipSameSizeAndDate: false }),
    cs: [conflictExists0, conflictExists1],
    a: array(["no for all"]),
    e: [[conflictExists0, "skip"], [conflictExists1, "skip"]],
  },
  {
    s: solvers.defaultSolver({ skip: false, overwrite: false, skipSameSizeAndDate: false }),
    cs: [conflictExists0, conflictExists1, conflictExists3],
    a: array(["no", "yes for all"]),
    e: [[conflictExists0, "skip"], [conflictExists1, "overwrite"], [conflictExists3, "overwrite"]],
  },
];

it("works", async () => {
  for (
    const {
      s: solver,
      cs: conflicts,
      a: askConfirmation,
      e: expected,
    } of tests
  ) {
    await pipe(
      solver(conflicts)({ askConfirmation }),
      testExpectRes(res => {
        expect(res).toEqual(expected);
      }),
    )();
  }
});
