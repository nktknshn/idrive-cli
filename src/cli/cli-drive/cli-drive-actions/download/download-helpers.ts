import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { constVoid, flow, identity, pipe } from 'fp-ts/lib/function'
// import { fstat, mkdir as mkdirTask, writeFile } from '../../../../lib/fs'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RT from 'fp-ts/lib/ReaderTask'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { Eq } from 'fp-ts/lib/string'
import * as TE from 'fp-ts/lib/TaskEither'
import micromatch from 'micromatch'
import { Readable } from 'stream'
import { DepFetchClient, DepFs } from '../../../../icloud/deps'
import { getUrlStream } from '../../../../icloud/deps/getUrlStream'
import { DepDriveApi, DriveApi, Query } from '../../../../icloud/drive'
import * as T from '../../../../icloud/drive/drive-api/icloud-drive-types'
import { prependPath } from '../../../../icloud/drive/helpers'
import { err } from '../../../../util/errors'
import { guardFstRO, guardSnd, isDefined } from '../../../../util/guards'
import { loggerIO } from '../../../../util/loggerIO'
import { printerIO } from '../../../../util/logging'
import { stripTrailingSlash } from '../../../../util/normalize-path'
import { Path } from '../../../../util/path'
import { XXX } from '../../../../util/types'
import { hasOwnProperty } from '../../../../util/util'
import { ConflictsSolver, handleLocalFilesConflicts } from './download-conflict'
import {
  DownloadICloudFilesFunc,
  DownloadInfo,
  DownloadStructure,
  DownloadTask,
  DownloadUrlToFile,
  FilterTreeResult,
} from './types'

export const writeFileFromReadable = (destpath: string) =>
  (readble: Readable): (deps: DepFs<'createWriteStream'>) => TE.TaskEither<Error, void> =>
    deps =>
      TE.tryCatch(
        () => {
          return new Promise(
            (resolve, reject) => {
              const stream = deps.fs.createWriteStream(destpath)
              readble.pipe(stream).on('close', resolve)
            },
          )
        },
        e => err(`error writing file ${destpath}: ${e}`),
      )

export const downloadUrlToFile: DownloadUrlToFile<DepFetchClient & DepFs<'createWriteStream'>> = (
  url: string,
  destpath: string,
) =>
  pipe(
    loggerIO.debug(`getting ${destpath}`),
    RTE.fromIO,
    RTE.chain(() => getUrlStream({ url })),
    RTE.orElseFirst((err) => RTE.fromIO(printerIO.print(`[-] ${err}`))),
    RTE.chainFirstIOK(() => printerIO.print(`writing ${destpath}`)),
    RTE.chainW(writeFileFromReadable(destpath)),
    RTE.orElseFirst((err) => RTE.fromIO(printerIO.print(`[-] ${err}`))),
  )

const downloadUrlsPar = (
  urlDest: Array<readonly [url: string, localpath: string]>,
): RT.ReaderTask<
  DepFetchClient & DepFs<'createWriteStream'>,
  [E.Either<Error, void>, readonly [string, string]][]
> => {
  return pipe(
    urlDest,
    A.map(([u, d]) => downloadUrlToFile(u, d)),
    A.sequence(RT.ApplicativePar),
    RT.map(A.zip(urlDest)),
  )
}

export const createDirStruct = (
  dirs: string[],
): RTE.ReaderTaskEither<DepFs<'mkdir'>, Error, void> =>
  ({ fs: { mkdir: mkdirTask } }) => {
    const mkdir = flow(
      mkdirTask,
      TE.orElseW(e =>
        isEexistError(e)
          ? TE.of(constVoid())
          : TE.left(e)
      ),
    )

    return pipe(
      pipe(dirs, A.map(mkdir)),
      TE.sequenceSeqArray,
      TE.map(constVoid),
    )
  }

export const getDirectoryStructure = (paths: string[]) => {
  const parseDown = (path: string) => {
    const result = []

    while (path !== '/') {
      result.push(path)
      path = Path.parse(path).dir
    }

    return A.reverse(result)
  }

  return pipe(
    paths,
    A.map(Path.parse),
    A.zip(paths),
    A.map(([_, p]) => p.endsWith('/') ? stripTrailingSlash(p) : _.dir),
    A.map(parseDown),
    A.flatten,
    A.uniq<string>(Eq),
  )
}

type DefaultFunc = (opts: {
  include: string[]
  exclude: string[]
}) => (files: [string, T.DriveChildrenItemFile]) => boolean

const defaultFunc: DefaultFunc = ({ include, exclude }) =>
  ([path, item]) =>
    (include.length == 0 || micromatch.any(path, include, { dot: true }))
    && (exclude.length == 0 || !micromatch.any(path, exclude, { dot: true }))

const filterFlatTree = ({
  exclude,
  include,
  func = defaultFunc({ exclude, include }),
}: {
  include: string[]
  exclude: string[]
  func?: (files: [string, T.DriveChildrenItemFile]) => boolean
}) =>
  <T extends T.Details>(flatTree: [string, T.DetailsOrFile<T>][]) => {
    const files = pipe(
      flatTree,
      A.filter(guardSnd(T.isFile)),
    )

    const folders = pipe(
      flatTree,
      A.filter(guardSnd(T.isFolderLike)),
    )

    const { left: excluded, right: validFiles } = pipe(
      files,
      A.partition(func),
    )

    return {
      files: validFiles,
      folders,
      excluded,
    }
  }

export const filterFlattenFolderTree = (opts: {
  include: string[]
  exclude: string[]
  func?: (files: [string, T.DriveChildrenItemFile]) => boolean
}) =>
  <T extends T.Details>(flatTree: [string, T.DetailsOrFile<T>][]): FilterTreeResult => {
    const { excluded, files, folders } = filterFlatTree(opts)(flatTree)

    const { left: downloadable, right: empties } = pipe(
      files,
      A.partition(([, file]) => file.size == 0),
    )

    const dirstruct = pipe(
      A.concat(downloadable)(empties),
      A.concatW(folders),
      A.map(a => a[0]),
      getDirectoryStructure,
    )

    return {
      dirstruct,
      downloadable,
      empties,
      excluded,
    }
  }

export const recursiveDirMapper = (
  dstpath: string,
  mapPath: (path: string) => string = identity,
) =>
  (ds: DownloadStructure): DownloadTask => {
    return {
      downloadable: ds.downloadable
        .map(([remotepath, file]) => ({
          info: [remotepath, file],
          localpath: prependPath(dstpath)(mapPath(remotepath)),
        })),
      empties: ds.empties
        .map(([remotepath, file]) => ({
          info: [remotepath, file],
          localpath: prependPath(dstpath)(mapPath(remotepath)),
        })),
      localdirstruct: [
        dstpath,
        ...ds.dirstruct
          .map(p => prependPath(dstpath)(mapPath(p))),
      ],
    }
  }

export const createDownloadTask = <SolverDeps>(
  deps: {
    conflictsSolver: ConflictsSolver<SolverDeps>
    toDirMapper: (ds: DownloadStructure) => DownloadTask
  },
) =>
  (ds: DownloadStructure): RTE.ReaderTaskEither<
    DepFs<'fstat'> & SolverDeps,
    Error,
    DownloadTask & { initialTask: DownloadTask }
  > => {
    return pipe(
      deps.toDirMapper(ds),
      handleLocalFilesConflicts({
        // conflictsSolver: resolveConflictsRename,
        // conflictsSolver: solvers.resolveConflictsOverwrightIfSizeDifferent(
        //   file => file.extension === 'band' && file.zone.endsWith('mobilegarageband'),
        // ),
        conflictsSolver: deps.conflictsSolver,
        //  solvers.resolveConflictsAskEvery,
      }),
    )
  }

const createEmptyFiles = (paths: string[]): RTE.ReaderTaskEither<DepFs<'writeFile'>, Error, unknown[]> => {
  return ({ fs: { writeFile } }) =>
    pipe(
      paths,
      A.map(path => writeFile(path, '')),
      A.sequence(TE.ApplicativePar),
    )
}

export const createEmpties = ({ empties }: DownloadTask): RTE.ReaderTaskEither<DepFs<'writeFile'>, Error, void> =>
  pipe(
    empties.length > 0
      ? pipe(
        RTE.ask<DepFs<'writeFile'>>(),
        RTE.chainFirstIOK(() => loggerIO.debug(`creating empty ${empties.length} files`)),
        RTE.chainW(({ fs: { writeFile } }) =>
          pipe(
            empties.map(_ => _.localpath),
            A.map(path => writeFile(path, '')),
            A.sequence(TE.ApplicativePar),
            RTE.fromTaskEither,
          )
        ),
        RTE.map(constVoid),
      )
      : RTE.of(constVoid()),
  )

export const downloadICloudFilesChunked = (
  { chunkSize = 5 },
): DownloadICloudFilesFunc<DepDriveApi<'downloadBatch'> & DepFetchClient & DepFs<'createWriteStream'>> =>
  ({ downloadable }) => {
    return pipe(
      splitIntoChunks(downloadable, chunkSize),
      A.map(downloadChunkPar),
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

const downloadChunkPar = (
  chunk: NA.NonEmptyArray<{ info: DownloadInfo; localpath: string }>,
): XXX<
  Query.State,
  DepDriveApi<'downloadBatch'> & DepFetchClient & DepFs<'createWriteStream'>,
  [E.Either<Error, void>, readonly [url: string, path: string]][]
> => {
  return pipe(
    DriveApi.downloadBatch<Query.State>({
      docwsids: chunk.map(_ => _.info[1]).map(_ => _.docwsid),
      zone: NA.head(chunk).info[1].zone,
    }),
    SRTE.chainW((downloadResponses) => {
      const urls = pipe(
        downloadResponses,
        A.map(_ => _.data_token?.url ?? _.package_token?.url),
      )

      return SRTE.fromReaderTaskEither(pipe(
        A.zip(urls)(chunk),
        A.map(([{ localpath }, url]) => [url, localpath] as const),
        A.filter(guardFstRO(isDefined)),
        RTE.fromReaderTaskK(downloadUrlsPar),
      ))
    }),
  )
}

const isEnoentError = (e: Error) => hasOwnProperty(e, 'code') && e.code === 'ENOENT'

const isEexistError = (e: Error) => hasOwnProperty(e, 'code') && e.code === 'EEXIST'
