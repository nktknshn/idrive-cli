import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { constUndefined, constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as RT from 'fp-ts/lib/ReaderTask'
import { fst } from 'fp-ts/lib/ReadonlyTuple'
import * as R from 'fp-ts/lib/Record'
import { Eq } from 'fp-ts/lib/string'
import * as TE from 'fp-ts/lib/TaskEither'
import micromatch from 'micromatch'
import { Readable } from 'stream'
import { Api, Drive } from '../../../../icloud/drive'
import { DepApi, DepFetchClient, DepFs } from '../../../../icloud/drive/deps/deps'
import * as DF from '../../../../icloud/drive/drive'
import { FolderTree, zipFolderTreeWithPath } from '../../../../icloud/drive/drive-methods/get-folders-trees'
import { prependPath } from '../../../../icloud/drive/helpers'
import * as T from '../../../../icloud/drive/types'
import { err, SomeError } from '../../../../lib/errors'
// import { fstat, mkdir as mkdirTask, writeFile } from '../../../../lib/fs'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { loggerIO } from '../../../../lib/loggerIO'
import { printerIO } from '../../../../lib/logging'
import { normalizePath, stripTrailingSlash } from '../../../../lib/normalize-path'
import { XXX } from '../../../../lib/types'
import { guardFst, guardSnd, hasOwnProperty, isDefined, Path } from '../../../../lib/util'
import { handleLocalFilesConflicts, solvers } from './download-conflict'
import {
  DownloadICloudFilesFunc,
  DownloadInfo,
  DownloadStructure,
  DownloadTask,
  DownloadUrlToFile,
  FilterTreeResult,
} from './types'
// export const mkdirTask = (path: string) =>
//   pipe(
//     TE.fromIO<void, SomeError>(loggerIO.debug(`creating ${path}`)),
//     TE.chain(() => mkdir(path)),
//   )

// export const writeFile = (destpath: string) =>
//   (readble: Readable) =>
//     TE.tryCatch(
//       () => {
//         // const writer = createWriteStream(destpath)
//         // readble.pipe(writer)
//         // return TE.taskify(stream.finished)(writer)()
//         return writeFile(destpath, readble)
//       },
//       e => err(`error writing file ${destpath}: ${e}`),
//     )

export const writeFileFromReadable = (destpath: string) =>
  (readble: Readable): (deps: DepFs<'createWriteStream'>) => TE.TaskEither<Error, void> =>
    deps =>
      TE.tryCatch(
        () => {
          // const writer = createWriteStream(destpath)
          // readble.pipe(writer)
          // return TE.taskify(stream.finished)(writer)()
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
): RTE.ReaderTaskEither<DepFetchClient & DepFs<'createWriteStream'>, Error, void> =>
  pipe(
    loggerIO.debug(`getting ${destpath}`),
    RTE.fromIO,
    RTE.chain(() => Api.getUrlStream({ url })),
    RTE.orElseFirst((err) => RTE.fromIO(printerIO.print(`[-] ${err}`))),
    RTE.chainFirstIOK(() => printerIO.print(`writing ${destpath}`)),
    RTE.chainW(writeFileFromReadable(destpath)),
    RTE.orElseFirst((err) => RTE.fromIO(printerIO.print(`[-] ${err}`))),
  )

export const downloadUrlsPar = (
  urlDest: Array<readonly [url: string, dest: string]>,
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

export const createEmptyFiles = (paths: string[]): RTE.ReaderTaskEither<DepFs<'writeFile'>, Error, unknown[]> => {
  return ({ fs: { writeFile } }) =>
    pipe(
      paths,
      // A.map(p => Path.join(dstpath, p)),
      A.map(path => writeFile(path, '')),
      A.sequence(TE.ApplicativePar),
    )
}

const isEnoentError = (e: Error) => hasOwnProperty(e, 'code') && e.code === 'ENOENT'

const isEexistError = (e: Error) => hasOwnProperty(e, 'code') && e.code === 'EEXIST'

export const createDirsList = (
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

export const filterFolderTree = (
  { exclude, include }: { include: string[]; exclude: string[] },
) =>
  (tree: FolderTree<T.DetailsDocwsRoot | T.NonRootDetails>): FilterTreeResult => {
    const flatTree = zipFolderTreeWithPath('/', tree)

    const files = pipe(
      flatTree,
      A.filter(guardSnd(T.isFile)),
    )

    const folders = pipe(
      flatTree,
      A.filter(guardSnd(T.isFolderLike)),
    )

    const { left: excluded, right: valid } = pipe(
      files,
      A.partition(
        ([path, item]) =>
          (include.length == 0 || micromatch.any(path, include, { dot: true }))
          && (exclude.length == 0 || !micromatch.any(path, exclude, { dot: true })),
      ),
    )

    const { left: downloadable, right: empties } = pipe(
      valid,
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

export const toDirMapper = (dstpath: string) =>
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

export const basicDownloadTask = (_toDirMapper: (ds: DownloadStructure) => DownloadTask) =>
  (ds: DownloadStructure) => {
    const task = _toDirMapper(ds)

    return handleLocalFilesConflicts({
      // conflictsSolver: resolveConflictsRename,
      conflictsSolver: solvers.resolveConflictsOverwrightIfSizeDifferent(
        file => file.extension === 'band' && file.zone.endsWith('mobilegarageband'),
      ),
    })(task)
  }

export const createEmpties = ({ empties }: DownloadTask) =>
  pipe(
    empties.length > 0
      ? pipe(
        loggerIO.debug(`creating empty ${empties.length} files`),
        RTE.fromIO,
        RTE.chain(() => createEmptyFiles(empties.map(_ => _.localpath))),
        RTE.map(constVoid),
      )
      : RTE.of(constVoid()),
  )

export const downloadICloudFilesChunked = (
  { chunkSize = 5 },
): DownloadICloudFilesFunc<DepApi<'downloadBatch'> & DepFetchClient & DepFs<'createWriteStream'>> =>
  ({ downloadable }) => {
    return pipe(
      splitIntoChunks(downloadable, chunkSize),
      A.map(downloadChunkPar),
      SRTE.sequenceArray,
      SRTE.map(flow(RA.toArray, A.flatten)),
    )
  }

export const splitIntoChunks = (
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

export const downloadChunkPar = (
  chunk: NA.NonEmptyArray<{ info: DownloadInfo; localpath: string }>,
): XXX<
  Drive.State,
  DepApi<'downloadBatch'> & DepFetchClient & DepFs<'createWriteStream'>,
  [E.Either<Error, void>, readonly [url: string, path: string]][]
> => {
  return pipe(
    Api.downloadBatch<Drive.State>({
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
