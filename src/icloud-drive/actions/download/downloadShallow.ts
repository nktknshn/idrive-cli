import { pipe } from 'fp-ts/lib/function'
import { DepAskConfirmation } from '../../../deps-types'
import { XXX } from '../../../util/types'
import { DriveLookup } from '../..'
import { solvers } from './conflict-solvers'
import { Deps, downloadFolder } from './download-folder'
import { Deps as DFuncDeps, downloadICloudFilesChunked } from './downloadICloudFilesChunked'
import { filterByIncludeExcludeGlobs, makeDownloadTaskFromTree } from './filterFlattenFolderTree'
import { shallowDirMapper } from './recursiveDirMapper'

type ShallowArgs = {
  path: string
  dstpath: string
  dry: boolean
  chunkSize: number
  include: string[]
  exclude: string[]
}

/** download file of files from a directory */
export const downloadShallow = (
  { path, dry, dstpath, chunkSize, include, exclude }: ShallowArgs,
): XXX<DriveLookup.LookupState, Deps & DFuncDeps & DepAskConfirmation, string> => {
  return pipe(
    downloadFolder(
      {
        path,
        // exclude,
        // include,
        dry,
        depth: 0,
        treefilter: makeDownloadTaskFromTree({
          filterFiles: filterByIncludeExcludeGlobs({ include, exclude }),
        }),
        conflictsSolver: solvers.resolveConflictsAskEvery,
        // solvers.resolveConflictsOverwrightIfSizeDifferent(
        //   file => file.extension === 'band' && file.zone.endsWith('mobilegarageband'),
        // ),
        toLocalFileSystemMapper: shallowDirMapper(dstpath),
        downloadFiles: downloadICloudFilesChunked({ chunkSize }),
      },
    ),
  )
}
