import { recursiveDirMapper, shallowDirMapper } from "./fs-mapper";

describe("fs-mapper", () => {
  const task = {
    downloadable: [
      { path: "/remote/path/to/file.txt", item: expect.any(Object) },
      { path: "/remote/path/to/file2.txt", item: expect.any(Object) },
      { path: "/Camera/file3.png", item: expect.any(Object) },
    ],
    empties: [{ path: "/remote/path/to/empty.txt", item: expect.any(Object) }],
  };

  it("maps the paths (shallow)", () => {
    const mapper = shallowDirMapper("/some/folder/");

    const mapped = mapper(task);

    expect(mapped).toEqual({
      downloadable: [
        {
          downloadItem: { path: "/remote/path/to/file.txt", item: expect.any(Object) },
          localpath: "/some/folder/file.txt",
        },
        {
          downloadItem: { path: "/remote/path/to/file2.txt", item: expect.any(Object) },
          localpath: "/some/folder/file2.txt",
        },
        { downloadItem: { path: "/Camera/file3.png", item: expect.any(Object) }, localpath: "/some/folder/file3.png" },
      ],
      empties: [
        {
          downloadItem: { path: "/remote/path/to/empty.txt", item: expect.any(Object) },
          localpath: "/some/folder/empty.txt",
        },
      ],
      localdirstruct: ["/some/folder/"],
    });
  });

  it("maps the paths (recursive)", () => {
    const mapper = recursiveDirMapper("/some/folder/");

    const mapped = mapper(task);

    expect(mapped).toEqual({
      downloadable: [
        {
          downloadItem: { path: "/remote/path/to/file.txt", item: expect.any(Object) },
          localpath: "/some/folder/remote/path/to/file.txt",
        },
        {
          downloadItem: { path: "/remote/path/to/file2.txt", item: expect.any(Object) },
          localpath: "/some/folder/remote/path/to/file2.txt",
        },
        {
          downloadItem: { path: "/Camera/file3.png", item: expect.any(Object) },
          localpath: "/some/folder/Camera/file3.png",
        },
      ],
      empties: [
        {
          downloadItem: { path: "/remote/path/to/empty.txt", item: expect.any(Object) },
          localpath: "/some/folder/remote/path/to/empty.txt",
        },
      ],
      localdirstruct: [
        "/some/folder/",
        "/some/folder/remote",
        "/some/folder/remote/path",
        "/some/folder/remote/path/to",
        "/some/folder/Camera",
      ],
    });
  });
});
