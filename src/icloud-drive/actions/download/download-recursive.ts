import micromatch from 'micromatch'
import { DepAskConfirmation } from '../../../deps-types'
import { Path } from '../../../util/path'
import { DriveLookup } from '../..'
import { solvers } from './conflict-solvers'
import { Deps as DownloadFolderDeps, downloadFolder } from './download-folder'
import { Deps as DFuncDeps, downloadICloudFilesChunked } from './downloadICloudFilesChunked'
import { filterByIncludeExcludeGlobs, makeDownloadTaskFromTree } from './filterFlattenFolderTree'
import { recursiveDirMapper } from './recursiveDirMapper'

export type Deps = DownloadFolderDeps & DFuncDeps & DepAskConfirmation

export type RecursiveArgs = {
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
  args: RecursiveArgs,
): DriveLookup.Lookup<string, Deps> => {
  const dirname = Path.dirname(micromatch.scan(args.path).base)

  console.log(
    dirname,
  )

  return downloadFolder(
    {
      ...args,
      depth: Infinity,
      treefilter: makeDownloadTaskFromTree({
        filterFiles: filterByIncludeExcludeGlobs(args),
      }),
      toLocalFileSystemMapper: args.keepStructure
        ? recursiveDirMapper(args.dstpath)
        : recursiveDirMapper(
          args.dstpath,
          p => p.substring(dirname.length),
        ),
      conflictsSolver: cfs =>
        cfs.length > 10
          ? solvers.resolveConflictsAskAll(cfs)
          : solvers.resolveConflictsAskEvery(cfs),
      downloadFiles: downloadICloudFilesChunked({ chunkSize: args.chunkSize }),
    },
  )
}
