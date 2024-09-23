import { sizeHumanReadable } from "../../../util/size-human-readable";
import { maxLength } from "../../../util/string";
import { UploadFolderTask } from "./types";

export const showUploadFolderTask = ({
  dirstruct,
  empties,
  excluded,
  uploadable,
}: UploadFolderTask) => {
  let result = "";

  const column = (s: string, n = 20) => s.padEnd(n);

  const uploadCount = uploadable.length + empties.length;
  const totalSize = uploadable.reduce((a, b) => a + b.item.stats.size, 0);
  const maxPathLength = maxLength(uploadable.map(a => a.item.path));

  result += `${column("Files to upload:")}${uploadCount}\n`;
  result += `${column("Total size:")}${sizeHumanReadable(totalSize)}\n`;

  if (dirstruct.length > 0) {
    result += "\n";
    result += `Remote folders to create:\n`;

    for (const dir of dirstruct) {
      result += `${dir}\n`;
    }
  }

  if (excluded.length > 0) {
    result += "\n";
    result += "Excluded files:\n";

    for (const item of excluded) {
      result += `${item.path}\n`;
    }
  }

  if (uploadable.length > 0) {
    result += "\n";
    result += `Will be uploaded:\n`;

    for (const item of uploadable) {
      result += `${item.item.path.padEnd(maxPathLength + 2)} → ${item.remotepath}\n`;
    }
  }

  return result;
};
