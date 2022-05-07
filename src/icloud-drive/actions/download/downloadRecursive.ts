import micromatch from 'micromatch'
import { Path } from '../../../util/path'
import { XXX } from '../../../util/types'
import { DriveLookup } from '../..'
import { solvers } from './conflict-solvers'
import { Deps, downloadFolder } from './download-folder'
import { Deps as DFuncDeps, downloadICloudFilesChunked } from './downloadICloudFilesChunked'
import { recursiveDirMapper } from './recursiveDirMapper'

export type RecursiveArgv = {
  path: string
  dstpath: string
  dry: boolean
  include: string[]
  exclude: string[]
  keepStructure: boolean
  chunkSize: number
}
/** recursively download files */
export const downloadRecursive = (
  argv: RecursiveArgv,
): XXX<DriveLookup.State, Deps & DFuncDeps, string> => {
  const dirname = Path.dirname(micromatch.scan(argv.path).base)
  console.log(
    dirname,
  )

  return downloadFolder(
    {
      ...argv,
      depth: Infinity,
      toLocalMapper: argv.keepStructure
        ? recursiveDirMapper(argv.dstpath)
        : recursiveDirMapper(
          argv.dstpath,
          p => p.substring(dirname.length),
        ),
      conflictsSolver: cfs =>
        cfs.length > 10
          ? solvers.resolveConflictsAskAll(cfs)
          : solvers.resolveConflictsAskEvery(cfs),
      downloadFiles: downloadICloudFilesChunked({ chunkSize: argv.chunkSize }),
    },
  )
}
