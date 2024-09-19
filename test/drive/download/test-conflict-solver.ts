import { ConflictExists, conflictExists, solvers } from "../../../src/icloud-drive/drive-actions/download";
import { DownloadItemMapped } from "../../../src/icloud-drive/drive-actions/download";
import { enableDebug } from "../debug";
import { makeConflictExistsFile } from "./helpers";

enableDebug(false);

const solver0 = solvers.defaultSolver({
  skip: false,
  overwrite: false,
  skipSameSizeAndDate: false,
});

const conflictExists0: ConflictExists = [
  // makeConflictExistsFile(
  //   {},
  // ),
];

describe("default solver", () => {
  it("works", () => {
    expect(true).toBe(true);
  });
});
