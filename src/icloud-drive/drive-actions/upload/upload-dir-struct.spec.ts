import { getDirStructTask, getSubdirsPerParent } from "./upload-dir-struct";

describe("getDirStructTask", () => {
  it("works", () => {
    expect(
      getDirStructTask(
        [
          "/a",
          "/a/b",
          "/a/c",
          "/a/b/d",
          "/a/b/e",
          "/a/b/e/f",
          "/a/b/e/g",
        ],
      ),
    ).toStrictEqual(
      [
        ["/", ["a"]],
        ["/a", ["b", "c"]],
        ["/a/b", ["d", "e"]],
        ["/a/b/e", ["f", "g"]],
      ],
    );
  });
});

describe("getSubdirsPerParent", () => {
  it("works", () => {
    expect(
      getSubdirsPerParent("/")(
        ["/a"],
      ),
    ).toStrictEqual(
      [["/", "a"]],
    );

    expect(
      getSubdirsPerParent("/a")(
        [
          "/",
          "/z",
          "/a",
          "/a/b",
          "/a/c",
          "/a/b/d",
          "/a/b/e",
          "/a/b/e/f",
          "/a/b/e/g",
        ],
      ),
    ).toStrictEqual(
      [
        // pairs to consecutivly create: [parent, subfolder_name]
        ["/a", "b"],
        ["/a", "c"],
        ["/a/b", "d"],
        ["/a/b", "e"],
        ["/a/b/e", "f"],
        ["/a/b/e", "g"],
      ],
    );
  });
});
