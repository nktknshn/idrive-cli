import { pipe } from 'fp-ts/lib/function'
import { Path } from '../../../../../util/path'
import { XXX } from '../../../../../util/types'
import { DriveQuery } from '../../..'
import { solvers } from './download-conflict'
import { Deps, downloadFolder } from './download-folder'
import { Deps as DFuncDeps, downloadICloudFilesChunked } from './downloadICloudFilesChunked'
import { DownloadTask } from './types'

type ShallowArgs = {
  path: string
  dstpath: string
  dry: boolean
  chunkSize: number
}
const mapper = (dstpath: string) =>
  (ds: DownloadTask) => ({
    downloadable: ds.downloadable.map(info => ({
      info,
      localpath: Path.join(dstpath, Path.basename(info[0])),
    })),
    empties: ds.empties.map(info => ({ info, localpath: Path.join(dstpath, Path.basename(info[0])) })),
    localdirstruct: [dstpath],
  })

/** download file of files from a directory */
export const downloadShallow = (
  { path, dry, dstpath, chunkSize }: ShallowArgs,
): XXX<DriveQuery.State, Deps & DFuncDeps, string> => {
  return pipe(
    downloadFolder(
      {
        argv: {
          path: Path.dirname(path),
          dstpath,
          exclude: [],
          include: [path],
          keepStructure: false,
          dry,
          chunkSize,
        },
        depth: 0,
        conflictsSolver: solvers.resolveConflictsAskEvery,
        // solvers.resolveConflictsOverwrightIfSizeDifferent(
        //   file => file.extension === 'band' && file.zone.endsWith('mobilegarageband'),
        // ),
        toLocalMapper: mapper(dstpath),
        downloadFiles: downloadICloudFilesChunked({ chunkSize }),
      },
    ),
  )
}
