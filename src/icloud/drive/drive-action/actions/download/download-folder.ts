import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { fst } from 'fp-ts/lib/ReadonlyTuple'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import micromatch from 'micromatch'
import { DepAskConfirmation } from '../../../../../deps/DepAskConfirmation'
import { DepFetchClient } from '../../../../../deps/DepFetchClient'
import { DepFs } from '../../../../../deps/DepFs'
import { guardFst } from '../../../../../util/guards'
import { printer, printerIO } from '../../../../../util/logging'
import { normalizePath, Path } from '../../../../../util/path'
import { XXX } from '../../../../../util/types'
import { DepApi, DriveQuery } from '../../..'
import { flattenFolderTreeWithBasepath } from '../../../util/folder-tree'
import { ConflictsSolver, handleLocalFilesConflicts } from './download-conflict'
import { createDirStruct, createEmpties, downloadTaskMapper } from './download-helpers'
import { downloadICloudFilesChunked } from './downloadICloudFilesChunked'
import { downloadRecursive, RecursiveArgv } from './downloadRecursive'
import { downloadShallow } from './downloadShallow'
import { filterFlattenFolderTree } from './filterFlattenFolderTree'
import {
  DownloadFileResult,
  DownloadICloudFilesFunc,
  DownloadTask,
  DownloadTaskLocalMapping,
  DownloadTaskMapper,
} from './types'

/*

Download a file or a folder.

`idrive download '/Obsidian/my1/note1.md' ./outputdir`

`idrive download '/Obsidian/my1/*.md' ./outputdir`

`idrive download -R '/Obsidian/my1/' ./outputdir`

Recursively download into `./outputdir/my1/`

`idrive download -R '/Obsidian/my1/diary/**\/*.md' ./outputdir`

Recursively download all `md` files into `./outputdir/diary/`

`idrive download -RS '/Obsidian/my1/diary/**\/*.md' ./outputdir`

Download download all into `./outputdir/Obsidian/my1/diary/`

Use `dry` flag to only check what is going to be downloaded

` include` and `exclude` flags are also supported

*/

// type Argv = {
//   path: string
//   dstpath: string
//   dry: boolean
//   recursive: boolean
//   include: string[]
//   exclude: string[]
//   keepStructure: boolean
//   chunkSize: number
// }

// export const download = (argv: Argv): XXX<DriveQuery.State, Deps, string> => {
//   const scan = micromatch.scan(argv.path)

//   if (scan.isGlob) {
//     argv.include = [scan.input, ...argv.include]
//     argv.path = scan.base
//   }

//   if (argv.recursive) {
//     return downloadRecursive(argv)
//   }
//   else {
//     return downloadShallow(argv)
//   }
// }

export type Deps =
  & DriveQuery.Deps
  // & DepApi<'downloadBatch'>
  // & DepFetchClient
  & DepAskConfirmation
  & DepFs<
    | 'fstat'
    // | 'opendir'
    | 'mkdir'
    | 'writeFile'
  > // | 'createWriteStream'

type DownloadFolderOpts<SolverDeps, DownloadDeps> = {
  argv: RecursiveArgv
  depth: number
  // downloadTaskMapper: DownloadTaskMapper<R>
  toLocalMapper: (ds: DownloadTask) => DownloadTaskLocalMapping
  conflictsSolver: ConflictsSolver<SolverDeps>
  downloadFiles: DownloadICloudFilesFunc<DownloadDeps>
}

export const downloadFolder = <SolverDeps, DownloadDeps>(
  {
    argv: { dry, exclude, include, path, chunkSize },
    depth,
    toLocalMapper,
    conflictsSolver,
    downloadFiles,
  }: DownloadFolderOpts<SolverDeps, DownloadDeps>,
): XXX<DriveQuery.State, Deps & SolverDeps & DownloadDeps, string> => {
  const verbose = dry
  // const downloadFiles = downloadICloudFilesChunked({ chunkSize })

  // printer.print(
  //   { path, dstpath, dry, exclude, include, keepStructure },
  // )

  const folderTree = pipe(
    DriveQuery.getByPathFolderDocwsroot(normalizePath(path)),
    SRTE.chain(dir => DriveQuery.getFoldersTrees([dir], depth)),
    SRTE.map(NA.head),
    SRTE.map(flattenFolderTreeWithBasepath(Path.dirname(path))),
  )

  const executeTask = (task: DownloadTaskLocalMapping) =>
    pipe(
      SRTE.fromReaderTaskEither<DepFs<'mkdir' | 'writeFile'>, Error, void, DriveQuery.State>(
        pipe(
          createDirStruct(task.localdirstruct),
          RTE.chainW(() => createEmpties(task)),
        ),
      ),
      SRTE.chainW(() => downloadFiles(task)),
    )

  return pipe(
    folderTree,
    SRTE.map(filterFlattenFolderTree({ include, exclude })),
    SRTE.chainW(ds =>
      SRTE.fromReaderTaskEither(pipe(
        toLocalMapper(ds),
        handleLocalFilesConflicts({
          conflictsSolver,
        }),
      ))
    ),
    SRTE.chainFirstIOK(flow(showTask({ verbose }), printerIO.print)),
    dry
      ? SRTE.map(() => [])
      : SRTE.chainW(executeTask),
    SRTE.map(resultsJson),
    SRTE.map(JSON.stringify),
  )
}

const showTask = ({ verbose = false }) =>
  (task: DownloadTaskLocalMapping & { initialTask: DownloadTaskLocalMapping }) =>
    task.downloadable.length > 0
      ? verbose
        ? `will be downloaded: \n${
          [...task.downloadable, ...task.empties].map(({ info, localpath }) => `${info[0]} into ${localpath}`)
            .join(
              '\n',
            )
        }\n\n`
          + `local dirs: ${task.localdirstruct.join('\n')}`
        : `${task.downloadable.length + task.empties.length} files will be downloaded`
      : `nothing to download. ${task.initialTask.downloadable.length} files were skipped by conflict solver`

const resultsJson = (results: DownloadFileResult[]) => {
  return {
    success: results.filter(flow(fst, E.isRight)).length,
    fail: results.filter(flow(fst, E.isLeft)).length,
    fails: pipe(
      results,
      A.filter(guardFst(E.isLeft)),
      A.map(([err, [url, path]]) => `${path}: ${err.left}`),
    ),
  }
}
