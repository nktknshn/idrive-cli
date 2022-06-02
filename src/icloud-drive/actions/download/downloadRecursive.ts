import micromatch from 'micromatch'
import { DepAskConfirmation } from '../../../deps-types'
import { Path } from '../../../util/path'
import { DriveLookup } from '../..'
import { solvers } from './conflict-solvers'
import { Deps as DownloadFolderDeps, downloadFolder } from './download-folder'
import { Deps as DFuncDeps, downloadICloudFilesChunked } from './downloadICloudFilesChunked'
import { filterByIncludeExcludeGlobs, makeDownloadTaskFromTree } from './filterFlattenFolderTree'
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
): DriveLookup.Effect<string, DownloadFolderDeps & DFuncDeps & DepAskConfirmation> => {
  const dirname = Path.dirname(micromatch.scan(argv.path).base)

  console.log(
    dirname,
  )

  return downloadFolder(
    {
      ...argv,
      depth: Infinity,
      treefilter: makeDownloadTaskFromTree({
        filterFiles: filterByIncludeExcludeGlobs(argv),
      }),
      toLocalFileSystemMapper: argv.keepStructure
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
