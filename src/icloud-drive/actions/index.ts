/** High-level actions for iCloud Drive. */

export { autocomplete } from './autocomplete'
export { cat, type Deps as DepsCat } from './cat'
export { type Deps as DownloadFolderDeps, downloadFolder } from './download/download-folder'
export { type Deps as DownloadRecursiveDeps, downloadRecursive } from './download/download-recursive'
export { type Deps as DownloadDeps, downloadShallow } from './download/download-shallow'

export { type Deps as DepsMkdir, mkdir } from './mkdir'
export { type DepsMove, move } from './move'
export { type DepsRm, rm } from './rm'
