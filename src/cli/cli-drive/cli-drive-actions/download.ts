import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { fst } from 'fp-ts/lib/ReadonlyTuple'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import micromatch from 'micromatch'
import { DepApi, Drive } from '../../../icloud/drive'
import { DepFetchClient } from '../../../icloud/drive/deps/util'
import { DepFs } from '../../../lib/fs'
import { printer, printerIO } from '../../../lib/logging'
import { XXX } from '../../../lib/types'
import { guardFst, Path } from '../../../lib/util'
import {
  basicDownloadTask,
  createDirsList,
  createEmpties,
  downloadICloudFilesChunked,
  filterFolderTree,
  toDirMapper,
} from './download/download-helpers'
import { CreateDownloadTask, DownloadTask } from './download/types'
import { normalizePath } from './helpers'

type Argv = {
  path: string
  dstpath: string
  dry: boolean
  include: string[]
  exclude: string[]
  // silent: boolean
}

// & SchemaEnv

type Deps =
  & Drive.Deps
  & DepApi<'downloadBatch'>
  & DepFetchClient
  & DepFs<'fstat' | 'opendir' | 'mkdir' | 'writeFile'>

export const downloadFolder = (argv: Argv): XXX<Drive.State, Deps, string> => {
  return _downloadFolder(
    argv,
    Infinity,
    basicDownloadTask(toDirMapper(argv.dstpath)),
  )
}

export const download = (
  { path, dry, dstpath }: {
    path: string
    dstpath: string
    raw: boolean
    dry: boolean
  },
): XXX<Drive.State, Deps, string> => {
  const globInput = {
    path: micromatch.scan(path).base,
    dstpath,
    dry,
    exclude: [],
    include: [
      '/' + Path.join(
        Path.basename(micromatch.scan(path).base),
        micromatch.scan(path).glob,
      ),
    ],
  }

  const basicInput = {
    path: Path.dirname(path),
    dstpath,
    dry,
    exclude: [],
    include: [
      path,
    ],
  }

  return pipe(
    _downloadFolder(
      micromatch.scan(path).isGlob ? globInput : basicInput,
      0,
      basicDownloadTask((ds) => ({
        downloadable: ds.downloadable.map(info => ({ info, localpath: Path.join(dstpath, Path.basename(info[0])) })),
        empties: ds.empties.map(info => ({ info, localpath: Path.join(dstpath, Path.basename(info[0])) })),
        localdirstruct: [dstpath],
      })),
    ),
  )
}

// export const downloadFolder = (
//   argv: Argv,
// ): XXX<DF.State, Deps, string> => {
//   return downloadFolder(argv)
// }

const _downloadFolder = <R>(
  { path, dstpath, dry, exclude, include }: Argv,
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
    { path, dstpath, dry, exclude, include },
  )

  const buildTask = pipe(
    Drive.getDocwsRoot(),
    SRTE.chainW((root) =>
      pipe(
        Drive.getByPathFolder(root, normalizePath(path)),
        SRTE.chain(dir => Drive.getFoldersTrees([dir], depth)),
        SRTE.map(NA.head),
      )
    ),
    SRTE.map(filterFolderTree({ include, exclude })),
    SRTE.chainFirstIOK(
      (task) =>
        () => {
          if (exclude.length > 0 && verbose) {
            printer.print(
              `excluded: \n${task.excluded.map(_ => _[0]).join('\n')}\n`,
            )
          }
        },
    ),
    SRTE.chainW(
      v => SRTE.fromReaderTaskEither(createDownloadTask(v)),
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
    buildTask,
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
