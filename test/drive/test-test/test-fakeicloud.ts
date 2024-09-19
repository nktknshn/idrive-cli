import * as O from "fp-ts/Option";
import { GetByPath } from "../../../src/icloud-drive";
import * as M from "./../util/mocked-drive";

const s = M.fakeicloud(
  M.file({ name: "fileinroot.txt" }),
  M.folder({ name: "folder1" })(
    M.file({ name: "file1.txt" }),
  ),
  M.appLibrary({ name: "Obsidian", zone: "iCloud.md.obsidian", docwsid: "documents" })(
    M.folder({ name: "my1" })(
      M.file({ name: "note1.md" }),
    ),
  ),
);

describe("fakeicloud", () => {
  it("path properties are correct", () => {
    expect(s.r.c["fileinroot.txt"].d.type).toBe("FILE");
    expect(s.r.c["fileinroot.txt"].name).toBe("fileinroot.txt");
    expect(s.r.c["fileinroot.txt"].path).toBe("/fileinroot.txt");
    expect(s.r.c.folder1.c["file1.txt"].path).toBe("/folder1/file1.txt");
    expect(s.r.c.Obsidian.c.my1.c["note1.md"].path).toBe("/Obsidian/my1/note1.md");
  });
});
