/** High-level actions for iCloud Drive. */

export { autocomplete } from "./autocomplete";
export { cat, type Deps as DepsCat } from "./cat";
export { type Deps as DepsDownloadFolder, downloadFolder as downloadFolder } from "./download/download-folder";
export { type Deps as DepsDownloadRecursive, downloadRecursive } from "./download/download-recursive";
export { type Deps as DownloadDeps, downloadShallow } from "./download/download-shallow";

export { listRecursive } from "./ls/ls-recursive";
export { listRecursiveTree } from "./ls/ls-tree";

export { type ListPathsFile, type ListPathsFolder, listShallow } from "./ls/ls-shallow";

export { type Deps as DepsEdit, edit } from "./edit";
export { type Deps as DepsMkdir, mkdir } from "./mkdir";
export { type DepsMove, move } from "./move";
export { type Deps as DepsRecover, recover } from "./recover";
export { type DepsRm, rm, rmCandidates } from "./rm";
export { type Deps as DepsUpload, uploadSingleFile } from "./upload/upload-files";
export { uploadMany } from "./upload/upload-files";
export { type Deps as DepsUploadFolder, uploadFolder } from "./upload/upload-folder";

export { type Deps as DepsDownloadFiles, downloadFiles } from "./download/download-files";
