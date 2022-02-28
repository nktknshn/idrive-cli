import assert from 'assert'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { apply, constVoid, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { fst, snd } from 'fp-ts/lib/ReadonlyTuple'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { delay } from 'fp-ts/lib/Task'
import * as T from 'fp-ts/lib/Task'
import * as TE from 'fp-ts/lib/TaskEither'
import * as TR from 'fp-ts/lib/Tree'
import { concatAll } from 'fp-ts/Monoid'
import { MonoidSum } from 'fp-ts/number'
import { createWriteStream } from 'fs'
import * as fs from 'fs/promises'
import { Readable } from 'stream'
import { defaultApiEnv } from '../../../defaults'
import * as API from '../../../icloud/drive/api'
import * as DF from '../../../icloud/drive/drive'
import {
  addPathToFolderTree,
  FolderTreeValue,
  zipFolderTreeWithPath,
} from '../../../icloud/drive/drive/get-folders-trees'
import { getUrlStream } from '../../../icloud/drive/requests/download'
import {
  Details,
  DetailsDocwsRoot,
  DriveChildrenItemFile,
  isFile,
  isFileItem,
  isNotFileG,
  NonRootDetails,
} from '../../../icloud/drive/requests/types/types'
import { err, SomeError } from '../../../lib/errors'
import { FetchClientEither } from '../../../lib/http/fetch-client'
import { logg, logger } from '../../../lib/logging'
import { NEA } from '../../../lib/types'
import { Path } from '../../../lib/util'
import { cliActionM2 } from '../../cli-action'
import { normalizePath } from './helpers'

const sum = concatAll(MonoidSum)

export const download = (
  { sessionFile, cacheFile, paths, noCache, structured }: {
    paths: string[]
    noCache: boolean
    sessionFile: string
    cacheFile: string
    structured: boolean
    glob: boolean
    raw: boolean
  },
) => {
  assert(A.isNonEmpty(paths))

  logger.debug(`download: ${pipe(paths)}`)

  const action = () => {
    return pipe(
      DF.searchGlobs(paths),
      DF.map(JSON.stringify),
    )
  }

  return pipe(
    { sessionFile, cacheFile, noCache, ...defaultApiEnv },
    cliActionM2(action),
  )
}

const treeStatistics = (
  tree: TR.Tree<
    FolderTreeValue<Details> & {
      path: string
    }
  >,
): {
  directories: number
  files: number
  size: number
} => {
  const forestStats = pipe(tree.forest, A.map(treeStatistics))

  const files = pipe(
    tree.value.details.items,
    A.filter(isFileItem),
  )

  const size = pipe(
    files,
    A.reduce(0, (acc, item) => acc + item.size),
  )

  return {
    directories: 1 + pipe(forestStats, A.reduce(0, (acc, cur) => acc + cur.directories)),
    files: files.length + pipe(forestStats, A.reduce(0, (acc, cur) => acc + cur.files)),
    size: size + pipe(forestStats, A.reduce(0, (acc, cur) => acc + cur.size)),
  }
}

import * as stream from 'stream'

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

const createStructure = (basedir: string, struct: string[]) => {
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

const createEmptyFiles = (paths: string[]) => {
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
import * as R from 'fp-ts/lib/Record'
export const downloadFolder = (
  { sessionFile, cacheFile, path, noCache, dstpath }: {
    path: string
    noCache: boolean
    sessionFile: string
    cacheFile: string
    structured: boolean
    glob: boolean
    dstpath: string
    raw: boolean
  },
) => {
  logger.debug(`download: ${path}`)
  const npath = normalizePath(path)

  // createWriteStream()

  const action = () =>
    pipe(
      DF.readEnv,
      SRTE.bind('tree', () =>
        pipe(
          DF.chainRoot((root) => DF.lsdir(root, npath)),
          DF.chain(dir => DF.getFoldersTrees([dir], Infinity)),
          DF.map(NA.head),
        )),
      SRTE.bind('treeWithPath', ({ tree }) => DF.of(addPathToFolderTree('/', tree))),
      SRTE.bind('flatTree', ({ tree }) => DF.of(zipFolderTreeWithPath('/', tree))),
      DF.chain(({ tree, flatTree, treeWithPath, env }) => {
        // const folders = pipe(
        //   flatTree,
        //   A.filter((item): item is [string, DetailsDocwsRoot | NonRootDetails] => isNotFileG(item[1])),
        // )

        const files = pipe(
          flatTree,
          A.filter((item): item is [string, DriveChildrenItemFile] => isFile(item[1])),
        )

        const { left: downloadable, right: empties } = pipe(
          files,
          A.partition(([, file]) => file.size == 0),
        )

        const emptyFilesPathes = empties.map(([path]) => Path.join(dstpath, path))

        if (!A.isNonEmpty(downloadable)) {
          return DF.of({})
        }

        const byZone = pipe(
          downloadable,
          NA.groupBy(_ => _[1].zone),
        )

        let chunks: NA.NonEmptyArray<[string, DriveChildrenItemFile]>[] = []

        for (const zone of R.keys(byZone)) {
          chunks.push(...A.chunksOf(5)(byZone[zone]))
        }

        const filesChunks = chunks

        const downloadChunk = (chunk: NA.NonEmptyArray<[path: string, file: DriveChildrenItemFile]>) => {
          return pipe(
            API.downloadBatch({
              docwsids: chunk.map(snd).map(_ => _.docwsid),
              zone: NA.head(chunk)[1].zone,
            }),
            DF.fromApiRequest,
            DF.chain(urls =>
              pipe(
                A.zip(urls)(chunk),
                A.map(
                  ([[path], url]) => [url, Path.join(dstpath, path)] as const,
                ),
                A.filter((item): item is [string, string] => !!item[0]),
                downloadUrls,
                apply({ fetch: env.fetch }),
                DF.fromTaskEither,
              )
            ),
          )
        }

        const downloadFiles = () =>
          pipe(
            filesChunks,
            A.map(downloadChunk),
            SRTE.sequenceArray,
            DF.map(a => [...a]),
            DF.map(A.flatten),
            DF.map(_ => {
              return {
                success: _.filter(_ => _.status === 'SUCCESS').length,
                fail: _.filter(_ => _.status === 'FAIL').length,
                fails: _.filter(_ => _.status === 'FAIL'),
                emptyFiles: emptyFilesPathes,
              }
            }),
          )

        return pipe(
          createStructure(dstpath, getDirStructure(treeWithPath)),
          DF.chain(() => createEmptyFiles(emptyFilesPathes)),
          DF.chain(() => downloadFiles()),
        )
      }),
      DF.map(JSON.stringify),
    )

  return pipe(
    { sessionFile, cacheFile, noCache, ...defaultApiEnv },
    cliActionM2(action),
  )
}
