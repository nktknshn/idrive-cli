import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { fst } from 'fp-ts/lib/ReadonlyTuple'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { DepFs } from '../../../deps-types'
import { guardFst } from '../../../util/guards'
import { printerIO } from '../../../util/logging'
import { normalizePath } from '../../../util/path'
import { DriveLookup, T } from '../..'
import { FlattenFolderTreeWithP } from '../../util/drive-folder-tree'
import {
  applySoultions,
  Conflict,
  ConflictsSolver,
  handleLocalFilesConflicts,
  lookForConflicts,
  Solution,
} from './download-conflict'
import { createEmpties, createLocalDirStruct } from './download-local'
import { filterFlattenFolderTree } from './filterFlattenFolderTree'
import { DownloadFileResult, DownloadICloudFilesFunc, DownloadItem, DownloadTask, DownloadTaskMapped } from './types'

/*

Download a file or a folder content.

`idrive download '/Obsidian/my1/note1.md' ./outputdir`

`idrive download -S '/Obsidian/my1/note1.md' ./outputdir`

`idrive download /Obsidian/my1/note1.md /Obsidian/my1/note2.md ./outputdir`

`idrive download -S /Obsidian/my1/note1.md /Obsidian/my1/note2.md ./outputdir`

`idrive download '/Obsidian/my1/*.md' ./outputdir`

Recursively download into `./outputdir/my1/`

`idrive download -R '/Obsidian/my1/' ./outputdir`

Recursively download all `md` files into `./outputdir/diary/`

`idrive download -R '/Obsidian/my1/diary/**\/*.md' ./outputdir`

Download download all into `./outputdir/Obsidian/my1/diary/`

`idrive download -RS '/Obsidian/my1/diary/**\/*.md' ./outputdir`

Use `dry` flag to only check what is going to be downloaded

` include` and `exclude` flags are also supported


*/

export type Deps =
  & DriveLookup.Deps
  & DepFs<
    | 'fstat'
    | 'mkdir'
    | 'writeFile'
  >

type DownloadFolderOpts<SolverDeps, DownloadDeps> = {
  path: string
  dry: boolean
  include: string[]
  exclude: string[]
  depth: number
  // downloadTaskMapper: DownloadTaskMapper<R>
  toLocalMapper: (ds: DownloadTask) => DownloadTaskMapped
  conflictsSolver: ConflictsSolver<SolverDeps>
  downloadFiles: DownloadICloudFilesFunc<DownloadDeps>
}

const prepare = (task: DownloadTaskMapped) =>
  pipe(
    SRTE.fromReaderTaskEither<DepFs<'mkdir' | 'writeFile'>, Error, void, DriveLookup.State>(
      pipe(
        createLocalDirStruct(task.localdirstruct),
        RTE.chainW(() => createEmpties(task)),
      ),
    ),
  )

const executeTask = <DownloadDeps>(
  { downloader }: { downloader: DownloadICloudFilesFunc<DownloadDeps> },
) =>
  (task: DownloadTaskMapped) =>
    pipe(
      prepare(task),
      SRTE.chainW(() => downloader(task)),
    )

export const downloadFolder = <SolverDeps, DownloadDeps>(
  {
    dry = false,
    exclude = [],
    include = [],
    path,
    depth,
    toLocalMapper,
    conflictsSolver,
    downloadFiles,
  }: DownloadFolderOpts<SolverDeps, DownloadDeps>,
): DriveLookup.Effect<string, Deps & SolverDeps & DownloadDeps> => {
  const verbose = dry
  // const downloadFiles = downloadICloudFilesChunked({ chunkSize })

  // printer.print(
  //   { path, dstpath, dry, exclude, include, keepStructure },
  // )

  // const downloadTask = pipe(
  //   DriveLookup.getFolderTreeByPathFlattenWP(normalizePath(path), depth),
  //   SRTE.map(filterFlattenFolderTree({ include, exclude })),
  // )
  const filter = filterFlattenFolderTree({ include, exclude })

  const aplloed = pipe(
    DriveLookup.getFolderTreeByPathFlattenWPDocwsroot(
      normalizePath(path),
      depth,
    ),
    SRTE.bindTo('folderTree'),
    SRTE.bind('downloadTask', ({ folderTree }) => SRTE.of(filter(folderTree))),
    SRTE.bind('mappedTask', ({ downloadTask }) =>
      pipe(
        SRTE.of(toLocalMapper(downloadTask)),
      )),
    SRTE.bindW('conflicts', ({ mappedTask }) =>
      pipe(
        SRTE.fromReaderTaskEither(
          RTE.fromReaderTaskK(lookForConflicts)(mappedTask),
        ),
      )),
    SRTE.bindW('solutions', ({ conflicts }) =>
      SRTE.fromReaderTaskEither(pipe(
        conflicts,
        A.matchW(() => RTE.of([]), conflictsSolver),
      ))),
    SRTE.bind('result', ({ mappedTask, solutions }) =>
      pipe(
        SRTE.of(
          applySoultions(mappedTask)(solutions),
        ),
      )),
  )

  return pipe(
    // mappedTask,
    // SRTE.chainW(ds =>
    //   SRTE.fromReaderTaskEither(pipe(
    //     ds,
    //     handleLocalFilesConflicts({
    //       conflictsSolver,
    //     }),
    //   ))
    // ),
    aplloed,
    // SRTE.map(_ => _.result),
    SRTE.chainFirstIOK(flow(showVerbose({ verbose }), printerIO.print)),
    SRTE.map(({ result }) => result),
    dry
      ? SRTE.map(() => [])
      : SRTE.chainW(executeTask({ downloader: downloadFiles })),
    SRTE.map(resultsJson),
    SRTE.map(JSON.stringify),
  )
}

const showVerbose = ({ verbose = false }) =>
  ({
    folderTree,
    downloadTask,
    mappedTask,
    conflicts,
    solutions,
    result,
  }: {
    folderTree: FlattenFolderTreeWithP<T.DetailsDocwsRoot | T.NonRootDetails>
    downloadTask: DownloadTask & {
      excluded: DownloadItem[]
    }
    mappedTask: DownloadTaskMapped
    conflicts: Conflict[]
    solutions: Solution[]
    result: DownloadTaskMapped
  }) => {
    const output = ''
  }

const showTask = ({ verbose = false }) =>
  (task: DownloadTaskMapped & { initialTask: DownloadTaskMapped }) =>
    task.downloadable.length > 0
      ? verbose
        ? `will be downloaded: \n${
          [...task.downloadable, ...task.empties].map(({ remoteitem: info, localpath }) =>
            `${info[0]} into ${localpath}`
          )
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
