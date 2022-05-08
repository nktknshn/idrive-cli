import { pipe } from 'fp-ts/lib/function'
import { DepAskConfirmation } from '../../../deps-types'
import { Path } from '../../../util/path'
import { XXX } from '../../../util/types'
import { DriveLookup } from '../..'
import { solvers } from './conflict-solvers'
import { Deps, downloadFolder } from './download-folder'
import { Deps as DFuncDeps, downloadICloudFilesChunked } from './downloadICloudFilesChunked'
import { shallowDirMapper } from './recursiveDirMapper'
import { DownloadTask } from './types'

type ShallowArgs = {
  path: string
  dstpath: string
  dry: boolean
  chunkSize: number
}

/** download file of files from a directory */
export const downloadShallow = (
  { path, dry, dstpath, chunkSize }: ShallowArgs,
): XXX<DriveLookup.State, Deps & DFuncDeps & DepAskConfirmation, string> => {
  return pipe(
    downloadFolder(
      {
        path: Path.dirname(path),
        exclude: [],
        include: [path],
        dry,
        depth: 0,
        conflictsSolver: solvers.resolveConflictsAskEvery,
        // solvers.resolveConflictsOverwrightIfSizeDifferent(
        //   file => file.extension === 'band' && file.zone.endsWith('mobilegarageband'),
        // ),
        toLocalMapper: shallowDirMapper(dstpath),
        downloadFiles: downloadICloudFilesChunked({ chunkSize }),
      },
    ),
  )
}
