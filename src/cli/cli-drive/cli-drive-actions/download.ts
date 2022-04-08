import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, identity, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { fst } from 'fp-ts/lib/ReadonlyTuple'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import micromatch from 'micromatch'
import { Drive } from '../../../icloud/drive'
import { DepApi, DepAskConfirmation, DepFetchClient, DepFs } from '../../../icloud/drive/deps'
import {
  addPathToFolderTree,
  flattenFolderTreeWithPath,
} from '../../../icloud/drive/drive-methods/drive-get-folders-trees'
import { printer, printerIO } from '../../../util/logging'
import { normalizePath } from '../../../util/normalize-path'
import { XXX } from '../../../util/types'
import { guardFst, Path } from '../../../util/util'
import { solvers } from './download/download-conflict'
import {
  createDirsList,
  createDownloadTask as createDownloadTask,
  createEmpties,
  downloadICloudFilesChunked,
  filterFolderTree,
  recursiveDirMapper,
} from './download/download-helpers'
import { CreateDownloadTask, DownloadTask } from './download/types'

type Argv = {
  path: string
  dstpath: string
  dry: boolean
  recursive: boolean
  include: string[]
  exclude: string[]
  keepStructure: boolean
}

// & SchemaEnv

type Deps =
  & Drive.Deps
  & DepApi<'downloadBatch'>
  & DepFetchClient
  & DepAskConfirmation
  & DepFs<
    'fstat' | 'opendir' | 'mkdir' | 'writeFile' | 'createWriteStream'
  >

export const download = (argv: Argv): XXX<Drive.State, Deps, string> => {
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
}

/** download file of files from a directory */
const downloadShallow = (
  { path, dry, dstpath }: ShallowArgs,
): XXX<Drive.State, Deps, string> => {
  return pipe(
    _downloadFolder(
      {
        path: Path.dirname(path),
        dstpath,
        exclude: [],
        include: [path],
        keepStructure: false,
        dry,
      },
      0,
      createDownloadTask({
        conflictsSolver: solvers.resolveConflictsAskEvery,
        // solvers.resolveConflictsOverwrightIfSizeDifferent(
        //   file => file.extension === 'band' && file.zone.endsWith('mobilegarageband'),
        // ),
        toDirMapper: (ds) => ({
          downloadable: ds.downloadable.map(info => ({ info, localpath: Path.join(dstpath, Path.basename(info[0])) })),
          empties: ds.empties.map(info => ({ info, localpath: Path.join(dstpath, Path.basename(info[0])) })),
          localdirstruct: [dstpath],
        }),
      }),
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
  // silent: boolean
}

/** recursively download files */
const downloadRecursive = (argv: RecursiveArgv): XXX<Drive.State, Deps, string> => {
  const dirname = Path.dirname(micromatch.scan(argv.path).base)

  return _downloadFolder(
    argv,
    Infinity,
    createDownloadTask({
      conflictsSolver: cfs =>
        cfs.length > 10
          ? solvers.resolveConflictsAskAll(cfs)
          : solvers.resolveConflictsAskEvery(cfs),
      toDirMapper: argv.keepStructure
        ? recursiveDirMapper(argv.dstpath)
        : recursiveDirMapper(
          argv.dstpath,
          p => p.substring(dirname.length),
        ),
    }),
  )
}

const _downloadFolder = <R>(
  { path, dstpath, dry, exclude, include, keepStructure }: RecursiveArgv,
  depth = Infinity,
  createDownloadTask: CreateDownloadTask<R>,
): XXX<Drive.State, Deps & R, string> => {
  const download = downloadICloudFilesChunked({ chunkSize: 5 })

  const verbose = dry
  const scan = micromatch.scan(path)

  if (scan.isGlob) {
    include = [scan.input, ...include]
    path = scan.base
  }

  printer.print(
    { path, dstpath, dry, exclude, include, keepStructure },
  )

  const getDownloadTask = pipe(
    Drive.getDocwsRoot(),
    SRTE.chainW((root) =>
      pipe(
        Drive.getByPathFolder(root, normalizePath(path)),
        SRTE.chain(dir => Drive.getFoldersTrees([dir], depth)),
        SRTE.map(NA.head),
        SRTE.map(flattenFolderTreeWithPath(Path.dirname(path))),
      )
    ),
    SRTE.map(filterFolderTree(
      { include, exclude },
    )),
    SRTE.chainW(ds =>
      SRTE.fromReaderTaskEither(
        createDownloadTask(ds),
      )
    ),
    SRTE.chainFirstIOK(
      (task) =>
        task.downloadable.length > 0
          ? printerIO.print(
            verbose
              ? `will be downloaded: \n${
                [...task.downloadable, ...task.empties].map(({ info, localpath }) => `${info[0]} into ${localpath}`)
                  .join(
                    '\n',
                  )
              }\n`
              : `${task.downloadable.length + task.empties.length} files will be downloaded`,
          )
          : printerIO.print(
            `nothing to download. ${task.initialTask.downloadable.length} files were skipped by conflict solver`,
          ),
    ),
  )

  const effect = (
    task: DownloadTask,
  ) =>
    pipe(
      SRTE.fromReaderTaskEither<
        DepFs<'mkdir' | 'writeFile'>,
        Error,
        void,
        Drive.State
      >(
        pipe(
          createDirsList(task.localdirstruct),
          RTE.chainW(() => createEmpties(task)),
        ),
      ),
      SRTE.chainW(() => download(task)),
    )

  return pipe(
    getDownloadTask,
    dry
      ? SRTE.map(() => [])
      : SRTE.chainW(effect),
    SRTE.map((results) => {
      return {
        success: results.filter(flow(fst, E.isRight)).length,
        fail: results.filter(flow(fst, E.isLeft)).length,
        fails: pipe(
          results,
          A.filter(guardFst(E.isLeft)),
          A.map(([err, [url, path]]) => `${path}: ${err.left}`),
        ),
      }
    }),
    SRTE.map(JSON.stringify),
  )
}
