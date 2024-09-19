import * as O from "fp-ts/Option";
import { GetByPath } from "../../../src/icloud-drive";
import * as M from "./../util/mocked-drive";

const s = M.fakeicloud(
  M.file({ name: "fileinroot.txt" }),
  M.folder({ name: "folder1" })(
    M.file({ name: "file1.txt" }),
  ),
);

describe("fakeicloud", () => {
  it("works", () => {
    expect(s.r.c["fileinroot.txt"].d.type).toBe("FILE");
    expect(s.r.c["fileinroot.txt"].name).toBe("fileinroot.txt");
    // expect(s.r.childrenWithPath[0].validPath).toStrictEqual(
    //   GetByPath.validPath([s.r.d], O.some(s.r.c["fileinroot.txt"].d)),
    // );
  });
});
