/** High-level actions for iCloud Drive. */

export { autocomplete } from './autocomplete'
export { cat, type Deps as DepsCat } from './cat'
export { type Deps as DownloadFolderDeps, downloadFolder } from './download/download-folder'
export { type Deps as DownloadRecursiveDeps, downloadRecursive } from './download/download-recursive'
export { type Deps as DownloadDeps, downloadShallow } from './download/download-shallow'

export { listRecursive } from './ls/ls-recursive'
export { listRecursiveTree } from './ls/ls-tree'

export { type ListPathFile as ListPathsFile, type ListPathFolder as ListPathsFolder, listPaths } from './ls/ls-shallow'

// export { lsRecursive } from './ls/ls-recursive'
// export { lsShallow } from './ls/ls-shallow'

export { type Deps as DepsEdit, edit } from './edit'
export { type Deps as DepsMkdir, mkdir } from './mkdir'
export { type DepsMove, move } from './move'
export { type Deps as DepsRecover, recover } from './recover'
export { type DepsRm, rm } from './rm'
export { type Deps as DepsUploadFolder, uploadFolder } from './upload/upload-folder'
export { type Deps as DepsUpload, uploadSingleFile } from './upload/uploads'
export { uploadMany as uploads } from './upload/uploads'
