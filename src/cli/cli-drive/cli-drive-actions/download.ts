import assert from 'assert'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { apply, constVoid, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { fst, mapFst, snd } from 'fp-ts/lib/ReadonlyTuple'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as TR from 'fp-ts/lib/Tree'
import { concatAll } from 'fp-ts/Monoid'
import { MonoidSum } from 'fp-ts/number'
import * as fs from 'fs/promises'
import * as API from '../../../icloud/drive/api'
import * as DF from '../../../icloud/drive/drive'
import {
  addPathToFolderTree,
  FolderTreeValue,
  zipFolderTreeWithPath,
} from '../../../icloud/drive/drive/get-folders-trees'
import { getUrlStream } from '../../../icloud/drive/requests/download'
import { Details, DriveChildrenItemFile, isFile } from '../../../icloud/drive/requests/types/types'
import { err, SomeError } from '../../../lib/errors'
import { FetchClientEither } from '../../../lib/http/fetch-client'
import { logger } from '../../../lib/logging'
import { Path } from '../../../lib/util'
import { normalizePath } from './helpers'

const sum = concatAll(MonoidSum)

export const download = (
  { paths, structured }: {
    paths: string[]
    structured: boolean
    glob: boolean
    raw: boolean
  },
) => {
  assert(A.isNonEmpty(paths))

  logger.debug(`download: ${pipe(paths)}`)

  return pipe(
    DF.searchGlobs(paths),
    DF.map(JSON.stringify),
  )
}

export const downloadFolder = (
  { path, dstpath }: {
    path: string
    structured: boolean
    glob: boolean
    dstpath: string
    raw: boolean
  },
) => {
  logger.debug(`download: ${path}`)

  return recursiveDownload({ path, dstpath })
}

const recursiveDownload = ({ path, dstpath }: { path: string; dstpath: string }) => {
  return pipe(
    DF.Do,
    SRTE.bind('tree', () =>
      pipe(
        DF.chainRoot((root) => DF.getByPathFolder(root, normalizePath(path))),
        DF.chain(dir => DF.getFoldersTrees([dir], Infinity)),
        DF.map(NA.head),
      )),
    SRTE.bind('treeWithPath', ({ tree }) => DF.of(addPathToFolderTree('/', tree))),
    SRTE.bind('flatTree', ({ tree }) => DF.of(zipFolderTreeWithPath('/', tree))),
    DF.chain(({ flatTree, treeWithPath }) => {
      const files = pipe(
        flatTree,
        A.filter((item): item is [string, DriveChildrenItemFile] => isFile(item[1])),
        A.map(mapFst(path => Path.join(dstpath, path))),
      )

      const { left: downloadable, right: empties } = pipe(
        files,
        A.partition(([, file]) => file.size == 0),
      )

      return pipe(
        createDirStructure(dstpath, getDirStructure(treeWithPath)),
        DF.chain(createEmptyFiles(empties.map(fst))),
        DF.chain(downloadFiles(downloadable)),
      )
    }),
    DF.map(JSON.stringify),
  )
}

const getDirStructure = <T extends Details>(
  tree: TR.Tree<FolderTreeValue<T> & { path: string }>,
): string[] => {
  return [
    `${tree.value.path}`,
    ...pipe(tree.forest, A.map(getDirStructure), A.flatten),
  ]
}

const mkdirTask = (path: string) =>
  pipe(
    TE.fromIO<void, SomeError>(() => {
      logger.debug(`creating ${path}`)
    }),
    TE.chain(() => TE.tryCatch(() => fs.mkdir(path), (e) => err(`cannot create ${path}: ${e}`))),
  )

const createDirStructure = (basedir: string, struct: string[]) => {
  const paths = pipe(
    struct,
    A.map(s => Path.join(basedir, s)),
    A.filter(_ => normalizePath(_) !== normalizePath(basedir)),
  )

  return pipe(
    TE.tryCatch(() => fs.stat(basedir), (e) => err(`cannot get stats for ${basedir} ${e}`)),
    TE.filterOrElse(s => s.isDirectory(), () => err(`${basedir} is not a directory`)),
    TE.map(() => pipe(paths, A.map(mkdirTask))),
    TE.chain(TE.sequenceSeqArray),
    TE.map(constVoid),
    DF.fromTaskEither,
  )
}

const downloadUrl = (url: string, destpath: string) =>
  ({ fetch }: { fetch: FetchClientEither }) => {
    return pipe(
      TE.fromIO<void, SomeError>(() => {
        logger.debug(`gett ${destpath}`)
      }),
      TE.chain(() => getUrlStream({ url, client: fetch })),
      // TE.chain(() =>
      //   pipe(
      //     TE.fromTask(delay(5000)(async () => Readable.from(''))),
      //     // TE.map(() => Readable.from('')),
      //   )
      // ),
      TE.foldW(
        (e) =>
          async () => {
            logger.error(`error downloading url: ${e}`)
            return E.right({ destpath, status: 'FAIL' })
          },
        (readble) => {
          return pipe(
            TE.fromIO<void, SomeError>(() => {
              logger.debug(`writing ${destpath}`)
            }),
            TE.chain(() =>
              TE.tryCatch(
                () => {
                  return fs.writeFile(destpath, readble)
                  // const writer = createWriteStream(destpath)
                  // readble.pipe(writer)
                  // return TE.taskify(stream.finished)(writer)()
                },
                e => err(`error writing file ${destpath}: ${e}`),
              )
            ),
            TE.map(() => ({ destpath, status: 'SUCCESS' })),
          )
        },
      ),
    )
  }

const downloadUrls = (urlDest: Array<readonly [string, string]>) =>
  ({ fetch }: { fetch: FetchClientEither }) => {
    return pipe(
      urlDest,
      A.map(([u, d]) => downloadUrl(u, d)({ fetch })),
      A.sequence(TE.ApplicativePar),
    )
  }

const createEmptyFiles = (paths: string[]) =>
  () => {
    return pipe(
      paths,
      A.map(path =>
        TE.tryCatch(
          () => fs.writeFile(path, ''),
          e => err(`error writing file ${path}: ${e}`),
        )
      ),
      A.sequence(TE.ApplicativePar),
      DF.fromTaskEither,
    )
  }

const downloadChunk = (chunk: NA.NonEmptyArray<readonly [path: string, file: DriveChildrenItemFile]>) => {
  return pipe(
    DF.readEnv,
    SRTE.bind('urls', () =>
      API.downloadBatch({
        docwsids: chunk.map(snd).map(_ => _.docwsid),
        zone: NA.head(chunk)[1].zone,
      })),
    DF.chain(({ urls, env }) =>
      pipe(
        A.zip(urls)(chunk),
        A.map(([[path], url]) => [url, path] as const),
        A.filter((item): item is [string, string] => !!item[0]),
        downloadUrls,
        apply({ fetch: env.fetch }),
        DF.fromTaskEither,
      )
    ),
  )
}

const downloadFiles = (
  downloadable: (readonly [path: string, file: DriveChildrenItemFile])[],
  chunkSize = 5,
) =>
  () => {
    if (!A.isNonEmpty(downloadable)) {
      return DF.of({})
    }

    const byZone = pipe(downloadable, NA.groupBy(([, file]) => file.zone))

    let filesChunks = []

    for (const zone of R.keys(byZone)) {
      filesChunks.push(...A.chunksOf(chunkSize)(byZone[zone]))
    }

    return pipe(
      filesChunks,
      A.map(downloadChunk),
      SRTE.sequenceArray,
      DF.map(a => A.flatten([...a])),
      DF.map(_ => {
        return {
          success: _.filter(_ => _.status === 'SUCCESS').length,
          fail: _.filter(_ => _.status === 'FAIL').length,
          fails: _.filter(_ => _.status === 'FAIL'),
          // emptyFiles: emptyFilesPathes,
        }
      }),
    )
  }
