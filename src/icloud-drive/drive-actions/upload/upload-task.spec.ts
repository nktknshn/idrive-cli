import { constant } from "fp-ts/lib/function";
import * as LT from "../../../util/localtree";
import { Path } from "../../../util/path";
import { makeUploadTaskFromTree } from "./upload-task";

const dir = (path: string, forest: LT.LocalTree[] = []): LT.LocalTree => ({
  value: {
    type: "directory",
    path,
    name: Path.basename(path),
    stats: expect.anything(),
  },
  forest,
});

const file = (path: string): LT.LocalTree => ({
  value: {
    type: "file",
    path,
    name: Path.basename(path),
    stats: {
      size: 100,
      mtime: new Date(),
      isDirectory: constant(false),
      isFile: constant(true),
    },
  },
  forest: [],
});

describe("makeUploadTaskFromTree", () => {
  it("works", () => {
    const tree: LT.LocalTree = dir("/", [
      dir("/a", [
        dir("/a/b", [file("/a/b/1.txt")]),
        dir("/a/c", [file("/a/c/2.txt")]),
        dir("/a/d"),
        dir("/a/e", [
          file("/a/e/2.txt"),
          // file("/a/e/3.txt"),
        ]),
      ]),
    ]);

    expect(
      makeUploadTaskFromTree({
        exclude: [
          "/a/e/**/*",
        ],
        include: [
          // "/a/e/3.txt",
        ],
      })(tree),
    ).toMatchObject(
      {
        dirstruct: [
          "/a",
          "/a/b",
          "/a/c",
        ],
        excluded: [
          {
            path: "/a/e/2.txt",
          },
        ],
        empties: [],
        uploadable: [
          {
            remotepath: "/a/b/1.txt",
            item: {
              path: "/a/b/1.txt",
              name: "1.txt",
              stats: expect.any(Object),
              type: "file",
            },
          },
          {
            remotepath: "/a/c/2.txt",
            item: {
              path: "/a/c/2.txt",
              name: "2.txt",
              stats: expect.any(Object),
              type: "file",
            },
          },
          // {
          //   remotepath: "/a/e/3.txt",
          //   item: {
          //     path: "/a/e/3.txt",
          //     name: "3.txt",
          //     stats: expect.any(Object),
          //     type: "file",
          //   },
          // },
        ],
      },
    );
  });
});
