import assert from 'assert'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import { fst } from 'fp-ts/lib/ReadonlyTuple'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { concatAll } from 'fp-ts/Monoid'
import { MonoidSum } from 'fp-ts/number'
import micromatch from 'micromatch'
import { SchemaEnv } from '../../../icloud/drive/api/basic'
import * as API from '../../../icloud/drive/api/methods'
import { Use } from '../../../icloud/drive/api/type'
import * as DF from '../../../icloud/drive/drive'
import { guardFst, isDefined, prependPath } from '../../../icloud/drive/helpers'
import { loggerIO } from '../../../lib/loggerIO'
import { printer, printerIO } from '../../../lib/logging'
import { XXX } from '../../../lib/types'
import { Path } from '../../../lib/util'
import { handleLocalFilesConflicts, solvers } from './download/conflict'
import {
  createDirsList,
  createEmptyFiles,
  DownloadInfo,
  DownloadStructure,
  DownloadTask,
  downloadUrlsPar,
  filterTree,
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
  & Use<'downloadBatch'>
  & Use<'fetchClient'>
  & SchemaEnv

type DownloadICloudFilesFunc<R> = (task: { downloadable: { info: DownloadInfo; localpath: string }[] }) => XXX<
  DF.State,
  R,
  [E.Either<Error, void>, readonly [url: string, path: string]][]
>

export const downloads = (
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

export const download = (
  { path, dry, dstpath }: {
    path: string
    dstpath: string
    raw: boolean
    dry: boolean
  },
) => {
  return pipe(
    downloadFolder(
      micromatch.scan(path).isGlob
        ? ({
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
        })
        : ({
          path: Path.dirname(path),
          dstpath,
          dry,
          exclude: [],
          include: [
            path,
          ],
        }),
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

const toDirMapper = (dstpath: string) =>
  (ds: DownloadStructure): DownloadTask => {
    return {
      downloadable: ds.downloadable.map(([remotepath, file]) => ({
        info: [remotepath, file],
        localpath: prependPath(dstpath)(remotepath),
      })),
      empties: ds.empties.map(([remotepath, file]) => ({
        info: [remotepath, file],
        localpath: prependPath(dstpath)(remotepath),
      })),
      localdirstruct: [dstpath, ...ds.dirstruct.map(prependPath(dstpath))],
    }
  }

const basicDownloadTask = (_toDirMapper: (ds: DownloadStructure) => DownloadTask) =>
  (ds: DownloadStructure) => {
    const task = _toDirMapper(ds)

    return handleLocalFilesConflicts({
      // conflictsSolver: resolveConflictsRename,
      conflictsSolver: solvers.resolveConflictsOverwrightIfSizeDifferent(
        file => file.extension === 'band' && file.zone.endsWith('mobilegarageband'),
      ),
    })(task)
  }

export const downloadFolder = (
  { path, dstpath, dry, exclude, include }: Argv,
  depth = Infinity,
  createDownloadTask = basicDownloadTask(toDirMapper(dstpath)),
): XXX<DF.State, Deps, string> => {
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
    DF.getRoot(),
    SRTE.chain((root) =>
      pipe(
        DF.getByPathFolder(root, normalizePath(path)),
        SRTE.chain(dir => DF.getFoldersTrees([dir], depth)),
        SRTE.map(NA.head),
      )
    ),
    SRTE.map(filterTree({ include, exclude })),
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
      createDownloadTask,
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

  const effect = (task: DownloadTask) =>
    pipe(
      createDirsList(task.localdirstruct),
      TE.chain(() => createEmpties(task)),
      SRTE.fromTaskEither,
      SRTE.chain(() => download(task)),
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

const createEmpties = ({ empties }: DownloadTask) =>
  pipe(
    empties.length > 0
      ? pipe(
        loggerIO.debug(`creating empty ${empties.length} files`),
        TE.fromIO,
        TE.chain(() => createEmptyFiles(empties.map(_ => _.localpath))),
        TE.map(constVoid),
      )
      : TE.of(constVoid()),
  )

const downloadICloudFilesChunked = (
  { chunkSize = 5 },
): DownloadICloudFilesFunc<Use<'downloadBatch'> & Use<'fetchClient'>> =>
  ({ downloadable }) => {
    return pipe(
      splitIntoChunks(downloadable, chunkSize),
      A.map(downloadChunkPar()),
      SRTE.sequenceArray,
      SRTE.map(flow(RA.toArray, A.flatten)),
    )
  }

const splitIntoChunks = (
  files: { info: DownloadInfo; localpath: string }[],
  chunkSize = 5,
): NA.NonEmptyArray<{ info: DownloadInfo; localpath: string }>[] => {
  const filesChunks = []

  const byZone = pipe(
    files,
    NA.groupBy((c) => c.info[1].zone),
  )

  for (const zone of R.keys(byZone)) {
    filesChunks.push(...A.chunksOf(chunkSize)(byZone[zone]))
  }

  return filesChunks
}

const downloadChunkPar = () =>
  (
    chunk: NA.NonEmptyArray<{ info: DownloadInfo; localpath: string }>,
  ): XXX<
    DF.State,
    Use<'downloadBatch'> & Use<'fetchClient'>,
    [E.Either<Error, void>, readonly [url: string, path: string]][]
  > => {
    return pipe(
      API.downloadBatch<DF.State>({
        docwsids: chunk.map(_ => _.info[1]).map(_ => _.docwsid),
        zone: NA.head(chunk).info[1].zone,
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
          A.map(([{ localpath }, url]) => [url, localpath] as const),
          A.filter(guardFst(isDefined)),
          RTE.fromReaderTaskK(downloadUrlsPar),
        ))
      }),
    )
  }
