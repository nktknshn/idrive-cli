import { fakeicloud } from "../util/mocked-drive/mocked-api";
import { appLibrary, file, folder } from "../util/mocked-drive/mocked-drive";

export const complexStructure0 = fakeicloud(
  folder({ name: "test1" })(),
  folder({ name: "test2" })(
    file({ name: "file1.txt", docwsid: "file1" }),
    file({ name: "file2.txt" }),
  ),
  folder({ name: "test3" })(),
  appLibrary({
    name: "Obsidian",
    docwsid: "documents",
    zone: "iCloud.md.obsidian",
  })(
    folder({ name: "my1" })(
      file({ name: "note1.md" }),
      file({ name: "note2.md" }),
      folder({ name: "bookmarks" })(
        file({ name: "index.md" }),
      ),
      folder({ name: "misc", tag: "misc" })(
        folder({ name: "js" })(
          file({ name: "index.js" }),
          file({ name: "abcdef.json" }),
          file({ name: "nested.txt" }),
        ),
        folder({ name: "images" })(
          folder({ name: "backup" })(),
          file({ name: "image1.png" }),
          file({ name: "image2.png" }),
          file({ name: "image3.png" }),
        ),
      ),
    ),
  ),
  file({ name: "fileinroot.txt", tag: "fileinroot.txt" }),
);
