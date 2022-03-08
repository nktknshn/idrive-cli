import assert from 'assert'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import { fst, mapFst, snd } from 'fp-ts/lib/ReadonlyTuple'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { concatAll } from 'fp-ts/Monoid'
import { MonoidSum } from 'fp-ts/number'
import * as API from '../../../icloud/drive/api/methods'
import { Use } from '../../../icloud/drive/api/type'
import * as DF from '../../../icloud/drive/drive'
import { guardFst, isDefined } from '../../../icloud/drive/helpers'
import { loggerIO } from '../../../lib/loggerIO'
import { printer, printerIO } from '../../../lib/logging'
import { XXX } from '../../../lib/types'
import { Path } from '../../../lib/util'
import { handleLocalFilesConflicts, solvers } from './download/conflict'
import {
  createDirStructure,
  createEmptyFiles,
  DownloadInto,
  DownloadTask,
  downloadUrlsPar,
  filterTree as createDownloadTask,
  prepareDestinationDir,
} from './download/helpers'
import { normalizePath } from './helpers'

const sum = concatAll(MonoidSum)

type Argv = {
  path: string
  dstpath: string
  dry: boolean
  include: string[]
  exclude: string[]
  // silent: boolean
}

type Deps =
  & DF.DriveMEnv
  & Use<'downloadBatchM'>
  & Use<'getUrlStream'>

type DownloadICloudFiles<R> = (
  dstpath: string,
) => (task: { downloadable: DownloadInto[] }) => XXX<
  DF.State,
  R,
  [E.Either<Error, void>, readonly [url: string, path: string]][]
>

export const downloadFolder = (
  argv: Argv,
): XXX<DF.State, Deps, string> => {
  return recursiveDownload(argv)
}

const recursiveDownload = (
  { path, dstpath, dry, exclude, include }: Argv,
): XXX<DF.State, Deps, string> => {
  const download = downloadICloudFilesChunked({ chunkSize: 5 })

  const verbose = dry

  const buildTask = pipe(
    DF.getRoot(),
    SRTE.chain((root) =>
      pipe(
        DF.getByPathFolder(root, normalizePath(path)),
        SRTE.chain(dir => DF.getFoldersTrees([dir], Infinity)),
        SRTE.map(NA.head),
      )
    ),
    SRTE.map(createDownloadTask({ include, exclude })),
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
    SRTE.chainTaskEitherK(
      handleLocalFilesConflicts({
        dstpath,
        // conflictsSolver: resolveConflictsRename,
        conflictsSolver: solvers.resolveConflictsOverwrightIfSizeDifferent(
          file => file.extension === 'band' && file.zone.endsWith('mobilegarageband'),
        ),
      }),
    ),
    SRTE.chainFirstIOK(
      (task) =>
        task.downloadable.length > 0
          ? printerIO.print(
            verbose
              ? `will be downloaded: \n${[...task.downloadable, ...task.empties].map(fst).join('\n')}\n`
              : `${task.downloadable.length + task.empties.length} files will be downloaded`,
          )
          : printerIO.print(
            `nothing to download. ${task.initialTask.downloadable.length} files were rejected by conflict solver`,
          ),
    ),
  )

  const action = (task: DownloadTask) =>
    pipe(
      createDirs(dstpath)(task),
      TE.chain(() => createEmpties(dstpath)(task)),
      SRTE.fromTaskEither,
      SRTE.chain(() => download(dstpath)(task)),
    )

  return pipe(
    buildTask,
    dry
      ? SRTE.map(() => [])
      : SRTE.chainW(action),
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

const createDirs = (dstpath: string) =>
  ({ dirstruct }: DownloadTask) =>
    pipe(
      loggerIO.debug(`creating local dirs`),
      TE.fromIO,
      TE.chain(() => prepareDestinationDir(dstpath)),
      TE.chain(() => createDirStructure(dstpath, dirstruct)),
    )

const createEmpties = (dstpath: string) =>
  ({ empties }: DownloadTask) =>
    pipe(
      empties.length > 0
        ? pipe(
          loggerIO.debug(`creating empty ${empties.length} files`),
          TE.fromIO,
          TE.chain(() => createEmptyFiles(dstpath, empties.map(fst))),
          TE.map(constVoid),
        )
        : TE.of(constVoid()),
    )

const downloadICloudFilesChunked = (
  { chunkSize = 5 },
): DownloadICloudFiles<Use<'downloadBatchM'> & Use<'getUrlStream'>> =>
  (dstpath) =>
    ({ downloadable }) => {
      return pipe(
        splitIntoChunks(
          pipe(downloadable, A.map(mapFst(path => Path.join(dstpath, path)))),
          chunkSize,
        ),
        A.map(downloadChunkPar()),
        SRTE.sequenceArray,
        SRTE.map(flow(RA.toArray, A.flatten)),
      )
    }

const splitIntoChunks = (files: DownloadInto[], chunkSize = 5): NA.NonEmptyArray<DownloadInto>[] => {
  const filesChunks = []

  const byZone = pipe(
    files,
    NA.groupBy(([, file]) => file.zone),
  )

  for (const zone of R.keys(byZone)) {
    filesChunks.push(...A.chunksOf(chunkSize)(byZone[zone]))
  }

  return filesChunks
}

const downloadChunkPar = () =>
  (
    chunk: NA.NonEmptyArray<DownloadInto>,
  ): XXX<
    DF.State,
    Use<'downloadBatchM'> & Use<'getUrlStream'>,
    [E.Either<Error, void>, readonly [url: string, path: string]][]
  > => {
    return pipe(
      API.downloadBatch<DF.State>({
        docwsids: chunk.map(snd).map(_ => _.docwsid),
        zone: NA.head(chunk)[1].zone,
      }),
      SRTE.chainW((downloadResponses) => {
        // const { left: zips, right: raw } = pipe(
        //   downloadResponses,
        //   A.partition(_ => _.data_token !== undefined),
        // )

        const urls = pipe(
          downloadResponses,
          A.map(_ => _.data_token?.url ?? _.package_token?.url),
        )

        return SRTE.fromReaderTaskEither(pipe(
          A.zip(urls)(chunk),
          A.map(([[path], url]) => [url, path] as const),
          A.filter(guardFst(isDefined)),
          RTE.fromReaderTaskK(downloadUrlsPar),
        ))
      }),
    )
  }

export const download = (
  { paths }: {
    paths: string[]
    raw: boolean
  },
) => {
  assert(A.isNonEmpty(paths))

  return pipe(
    DF.searchGlobs(paths),
    SRTE.map(JSON.stringify),
  )
}
