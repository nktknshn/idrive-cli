import { getDirectoryStructure } from "./get-directory-structure";

describe("getDirectoryStructure", () => {
  it("returns a list of directories", () => {
    // AI generated. idk if this is enough
    const tests: [string[], string[]][] = [
      [["/a/b/c/d", "/a/b/c", "/a/b", "/a", "/"], ["/a", "/a/b", "/a/b/c"]],
      [["/a/b/c/d", "/a/b/c", "/a/b", "/a", "/"], ["/a", "/a/b", "/a/b/c"]],
      [["/", "/a", "/a/b", "/a/b/c", "/a/b/c/d"], ["/a", "/a/b", "/a/b/c"]],
      [["/a/b/c/d", "/a/b/c", "/a/b", "/a", "/"], ["/a", "/a/b", "/a/b/c"]],
      [
        ["/a/b/c/d/e/x", "/a/b/c/d/f/y"],
        ["/a", "/a/b", "/a/b/c", "/a/b/c/d", "/a/b/c/d/e", "/a/b/c/d/f"],
      ],
      // trailing slash
      [["/1"], []],
      [["/1/"], ["/1"]],
      [["1"], []],
      [["1/"], ["1"]],
      [
        // test missing leading slash
        // input
        ["1/2/3", "1/2", "1", "1/2/3/", "1/2", "1/2/3"],
        // expected
        ["1", "1/2", "1/2/3"],
      ],
      [
        ["./1/2/3", "./1/2", "./1", "./1/2/3/", "./1/2", "./1/2/3"],
        ["./1", "./1/2", "./1/2/3"],
      ],
    ];

    for (const [paths, dirs] of tests) {
      expect(getDirectoryStructure(paths)).toEqual(dirs);
    }
  });
});
