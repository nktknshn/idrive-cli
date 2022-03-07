import assert from 'assert'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { fst, mapFst, snd } from 'fp-ts/lib/ReadonlyTuple'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { concatAll } from 'fp-ts/Monoid'
import { MonoidSum } from 'fp-ts/number'
import * as API from '../../../icloud/drive/api/methods'
import { Use } from '../../../icloud/drive/api/type'
import * as DF from '../../../icloud/drive/drive'
import { FolderTree } from '../../../icloud/drive/drive/get-folders-trees'
import { guardFst, isDefined } from '../../../icloud/drive/helpers'
import * as T from '../../../icloud/drive/requests/types/types'
import { printer, printerIO } from '../../../lib/logging'
import { XXX } from '../../../lib/types'
import { Path } from '../../../lib/util'
import {
  applySoultion,
  ConflictsSolver,
  lookForConflicts,
  resolveConflictsSkipAll,
  showConflict,
} from './download/conflict'
import {
  createDirStructure,
  createEmptyFiles,
  DownloadInto,
  downloadUrlsPar,
  filterTree as applyGlobFilter,
  fstat,
  prepareDestinationDir,
  walkDirRel,
} from './download/helpers'
import { normalizePath } from './helpers'

const sum = concatAll(MonoidSum)

type Argv = {
  path: string
  dstpath: string
  dry: boolean
  exclude: boolean
  glob: string[]
  // silent: boolean
}

type Deps =
  & DF.DriveMEnv
  & Use<'renameItemsM'>
  & Use<'upload'>
  & Use<'fetchClient'>
  & Use<'downloadBatchM'>
  & Use<'getUrlStream'>

export const downloadFolder = (
  argv: Argv,
): XXX<DF.State, Deps, string> => {
  return recursiveDownload(argv)
}

const recursiveDownload = (
  { path, dstpath, dry, exclude, glob }: Argv,
): XXX<DF.State, Deps, string> => {
  return pipe(
    DF.getRoot(),
    SRTE.chain((root) =>
      pipe(
        DF.getByPathFolder(root, normalizePath(path)),
        SRTE.chain(dir => DF.getFoldersTrees([dir], Infinity)),
        SRTE.map(NA.head),
      )
    ),
    SRTE.chainW(
      downloadTree({
        dstpath,
        dry,
        exclude,
        glob,
        conflictsSolver: resolveConflictsSkipAll,
        downloader: downloadICloudFilesChunked({ chunkSize: 5 }),
      }),
    ),
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

const downloadTree = ({ dstpath, dry, exclude, glob, conflictsSolver, downloader }: {
  glob: string[]
  exclude: boolean
  dry: boolean
  dstpath: string
  conflictsSolver: ConflictsSolver
  downloader: DownloadICloudFiles
}) =>
  (tree: FolderTree<T.DetailsDocwsRoot | T.NonRootDetails>): XXX<
    DF.State,
    Use<'downloadBatchM'> & Use<'getUrlStream'>,
    [E.Either<Error, void>, readonly [url: string, path: string]][]
  > => {
    const dst = Path.normalize(dstpath)
    return pipe(
      TE.Do,
      TE.bind('initialtask', () => TE.of(applyGlobFilter(tree, glob, exclude))),
      TE.bind('conflicts', ({ initialtask }) =>
        pipe(
          fstat(dst),
          TE.fold(
            () => TE.of([]),
            () =>
              pipe(
                walkDirRel(dst),
                TE.map(localtree => lookForConflicts(localtree, initialtask)),
              ),
          ),
        )),
      TE.chainFirstIOK(
        ({ conflicts }) => printerIO.print(`conflicts: \n${conflicts.map(showConflict).join('\n')}\n`),
      ),
      TE.bind('task', ({ initialtask, conflicts }) =>
        pipe(
          conflictsSolver(conflicts),
          TE.map(applySoultion(initialtask)),
        )),
      TE.chainFirstIOK(
        ({ task, initialtask }) =>
          () => {
            if (glob.length > 0 && exclude) {
              printer.print(
                `excluded: \n${initialtask.excluded.map(_ => _[0]).join('\n')}\n`,
              )
            }
            printer.print(
              `will be downloaded: \n${[...task.downloadable, ...task.empties].map(_ => _[0]).join('\n')}\n`,
            )
          },
      ),
      SRTE.fromTaskEither,
      SRTE.chain(({ initialtask, task }) =>
        dry
          ? SRTE.of([])
          : pipe(
            TE.fromIO<void, Error>(printerIO.print(`creating local dirs`)),
            TE.chain(() => prepareDestinationDir(dstpath)),
            TE.chain(() => createDirStructure(dstpath, initialtask.dirstruct)),
            TE.chainIOK(() => printerIO.print(`creating empty ${task.empties.length} files`)),
            TE.chain(() => createEmptyFiles(dstpath, task.empties.map(fst))),
            TE.chainIOK(() => printerIO.print(`starting downloading ${task.downloadable.length} files `)),
            SRTE.fromTaskEither,
            SRTE.chain(() => downloader(dstpath, task.downloadable)),
          )
      ),
    )
  }

type DownloadICloudFiles = (
  dstpath: string,
  files: DownloadInto[],
) => XXX<
  DF.State,
  Use<'downloadBatchM'> & Use<'getUrlStream'>,
  [E.Either<Error, void>, readonly [url: string, path: string]][]
>

const downloadICloudFilesChunked = ({ chunkSize = 5 }): DownloadICloudFiles =>
  (dstpath, files) => {
    return pipe(
      splitIntoChunks(
        pipe(files, A.map(mapFst(path => Path.join(dstpath, path)))),
        chunkSize,
      ),
      A.map(downloadChunkPar()),
      SRTE.sequenceArray,
      SRTE.map(a => A.flatten([...a])),
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
      SRTE.chainW((urls) => {
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
    DF.map(JSON.stringify),
  )
}
