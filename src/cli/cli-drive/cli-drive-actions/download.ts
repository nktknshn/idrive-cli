import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { fst } from 'fp-ts/lib/ReadonlyTuple'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import micromatch from 'micromatch'
import { DepAskConfirmation, DepFetchClient, DepFs } from '../../../icloud/deps'
import { DepDriveApi, Query } from '../../../icloud/drive'
import { flattenFolderTreeWithPath } from '../../../icloud/drive/drive-query/drive-methods/drive-get-folders-trees'
import { guardFst } from '../../../util/guards'
import { printer, printerIO } from '../../../util/logging'
import { normalizePath } from '../../../util/normalize-path'
import { Path } from '../../../util/path'
import { XXX } from '../../../util/types'
import { solvers } from './download/download-conflict'
import {
  createDirStruct,
  createDownloadTask,
  createEmpties,
  downloadICloudFilesChunked,
  filterFlattenFolderTree,
  recursiveDirMapper,
} from './download/download-helpers'
import { CreateDownloadTask, DownloadFileResult, DownloadTask } from './download/types'

type Argv = {
  path: string
  dstpath: string
  dry: boolean
  recursive: boolean
  include: string[]
  exclude: string[]
  keepStructure: boolean
  chunkSize: number
}

type Deps =
  & Query.Deps
  & DepDriveApi<'downloadBatch'>
  & DepFetchClient
  & DepAskConfirmation
  & DepFs<
    'fstat' | 'opendir' | 'mkdir' | 'writeFile' | 'createWriteStream'
  >

export const download = (argv: Argv): XXX<Query.State, Deps, string> => {
  const scan = micromatch.scan(argv.path)

  if (scan.isGlob) {
    argv.include = [scan.input, ...argv.include]
    argv.path = scan.base
  }

  if (argv.recursive) {
    return downloadRecursive(argv)
  }
  else {
    return downloadShallow(argv)
  }
}

type ShallowArgs = {
  path: string
  dstpath: string
  dry: boolean
  chunkSize: number
}

/** download file of files from a directory */
const downloadShallow = (
  { path, dry, dstpath, chunkSize }: ShallowArgs,
): XXX<Query.State, Deps, string> => {
  return pipe(
    _downloadFolder(
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
        createDownloadTask: createDownloadTask({
          conflictsSolver: solvers.resolveConflictsAskEvery,
          // solvers.resolveConflictsOverwrightIfSizeDifferent(
          //   file => file.extension === 'band' && file.zone.endsWith('mobilegarageband'),
          // ),
          toDirMapper: (ds) => ({
            downloadable: ds.downloadable.map(info => ({
              info,
              localpath: Path.join(dstpath, Path.basename(info[0])),
            })),
            empties: ds.empties.map(info => ({ info, localpath: Path.join(dstpath, Path.basename(info[0])) })),
            localdirstruct: [dstpath],
          }),
        }),
      },
    ),
  )
}

type RecursiveArgv = {
  path: string
  dstpath: string
  dry: boolean
  include: string[]
  exclude: string[]
  keepStructure: boolean
  chunkSize: number
}

/** recursively download files */
const downloadRecursive = (argv: RecursiveArgv): XXX<Query.State, Deps, string> => {
  const dirname = Path.dirname(micromatch.scan(argv.path).base)
  console.log(
    dirname,
  )

  return _downloadFolder(
    {
      argv: argv,
      depth: Infinity,
      createDownloadTask: createDownloadTask({
        toDirMapper: argv.keepStructure
          ? recursiveDirMapper(argv.dstpath)
          : recursiveDirMapper(
            argv.dstpath,
            p => p.substring(dirname.length),
          ),
        conflictsSolver: cfs =>
          cfs.length > 10
            ? solvers.resolveConflictsAskAll(cfs)
            : solvers.resolveConflictsAskEvery(cfs),
      }),
    },
  )
}

type DownloadFolderOpts<R> = {
  argv: RecursiveArgv
  depth: number
  createDownloadTask: CreateDownloadTask<R>
}

const _downloadFolder = <R>(
  {
    argv: { dry, exclude, include, path, chunkSize },
    depth,
    createDownloadTask,
  }: DownloadFolderOpts<R>,
): XXX<Query.State, Deps & R, string> => {
  const verbose = dry
  const downloadFiles = downloadICloudFilesChunked({ chunkSize })

  // printer.print(
  //   { path, dstpath, dry, exclude, include, keepStructure },
  // )

  const folderTree = pipe(
    Query.getCachedDocwsRoot(),
    SRTE.chainW((root) =>
      pipe(
        Query.getByPathFolder(root, normalizePath(path)),
        SRTE.chain(dir => Query.getFoldersTrees([dir], depth)),
        SRTE.map(NA.head),
        SRTE.map(flattenFolderTreeWithPath(Path.dirname(path))),
      )
    ),
  )

  const effect = (task: DownloadTask) =>
    pipe(
      SRTE.fromReaderTaskEither<DepFs<'mkdir' | 'writeFile'>, Error, void, Query.State>(
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
    SRTE.chainW(ds => SRTE.fromReaderTaskEither(createDownloadTask(ds))),
    SRTE.chainFirstIOK(flow(showTask({ verbose }), printerIO.print)),
    dry
      ? SRTE.map(() => [])
      : SRTE.chainW(effect),
    SRTE.map(resultsJson),
    SRTE.map(JSON.stringify),
  )
}

const showTask = ({ verbose = false }) =>
  (task: DownloadTask & { initialTask: DownloadTask }) =>
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
