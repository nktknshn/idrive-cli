import { FsStats } from "../../../util/fs";
import { Path } from "../../../util/path";

export type UploadResult = {
  status: { status_code: number; error_message: string };
  etag: string;
  zone: string;
  type: string;
  document_id: string;
  parent_id: string;
  mtime: number;
};

export type UploadFolderTask = {
  /** Folder structure */
  dirstruct: string[];
  /** Files to upload */
  uploadable: {
    remotepath: string;
    item: {
      /** local path */
      path: string;
      stats: FsStats;
      type: "file";
    };
  }[];
  empties: {
    remotepath: string;
    item: { path: string; stats: FsStats; type: "file" };
  }[];
  /** What is excluded */
  excluded: {
    path: string;
    stats: FsStats;
    type: "file";
  }[];
};

export const prependRemotePath = (parent: string) => (task: UploadFolderTask): UploadFolderTask => ({
  ...task,
  uploadable: task.uploadable.map(a => ({
    ...a,
    remotepath: Path.join(parent, a.remotepath),
  })),
  empties: task.empties.map(a => ({
    ...a,
    remotepath: Path.join(parent, a.remotepath),
  })),
  excluded: task.excluded,
  dirstruct: task.dirstruct.map(a => Path.join(parent, a)),
});
