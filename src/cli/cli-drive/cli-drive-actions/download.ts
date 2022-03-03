import assert from 'assert'
import * as A from 'fp-ts/lib/Array'
import { log as print } from 'fp-ts/lib/Console'
import * as E from 'fp-ts/lib/Either'
import { constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RT from 'fp-ts/lib/ReaderTask'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { fst, mapFst, mapSnd, snd } from 'fp-ts/lib/ReadonlyTuple'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as TR from 'fp-ts/lib/Tree'
import { concatAll } from 'fp-ts/Monoid'
import { MonoidSum } from 'fp-ts/number'
import * as fs from 'fs/promises'
import micromatch from 'micromatch'
import { Readable } from 'stream'
import * as API from '../../../icloud/drive/api/methods'
import { Use } from '../../../icloud/drive/api/type'
import * as DF from '../../../icloud/drive/drive'
import {
  addPathToFolderTree,
  FolderTree,
  FolderTreeValue,
  zipFolderTreeWithPath,
} from '../../../icloud/drive/drive/get-folders-trees'
import { guardFst, guardSnd, isDefined } from '../../../icloud/drive/helpers'
import {
  Details,
  DetailsDocwsRoot,
  DriveChildrenItemFile,
  isFile,
  NonRootDetails,
} from '../../../icloud/drive/requests/types/types'
import { err, SomeError } from '../../../lib/errors'
import { loggerIO } from '../../../lib/loggerIO'
import { logger } from '../../../lib/logging'
import { XXX } from '../../../lib/types'
import { Path } from '../../../lib/util'
import { normalizePath } from './helpers'

const sum = concatAll(MonoidSum)

export const download = (
  { paths, structured }: {
    paths: string[]
    structured: boolean
    raw: boolean
  },
) => {
  assert(A.isNonEmpty(paths))

  return pipe(
    DF.searchGlobs(paths),
    DF.map(JSON.stringify),
  )
}

type Deps =
  & DF.DriveMEnv
  & Use<'renameItemsM'>
  & Use<'upload'>
  & Use<'fetchClient'>
  & Use<'downloadBatchM'>
  & Use<'getUrlStream'>

export const downloadFolder = (
  argv: {
    path: string
    structured: boolean
    dstpath: string
    raw: boolean
    dry: boolean
    exclude: boolean
    glob: string[]
    // silent: boolean
  },
): XXX<DF.State, Deps, string> => {
  return recursiveDownload(argv)
}

const getDirectoryStructure = (paths: string[]) => {
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
    A.map(_ => _.dir),
    A.map(parseDown),
    A.flatten,
    A.uniq<string>({ equals: (a, b) => a == b }),
  )
}

const getJob = (
  tree: FolderTree<DetailsDocwsRoot | NonRootDetails>,
  glob: string[],
  exclude: boolean,
) => {
  const flatTree = zipFolderTreeWithPath('/', tree)

  const files = pipe(
    flatTree,
    A.filter(guardSnd(isFile)),
  )

  const { left: excluded, right: valid } = pipe(
    files,
    A.partition(
      ([path, item]) =>
        exclude
          ? !micromatch.any(path, glob)
          : micromatch.any(path, glob),
    ),
  )

  const { left: downloadable, right: empties } = pipe(
    valid,
    A.partition(([, file]) => file.size == 0),
  )

  const dirstruct = pipe(
    A.concat(downloadable)(empties),
    A.map(fst),
    getDirectoryStructure,
  )

  return {
    dirstruct,
    downloadable,
    empties,
    excluded,
  }
}

const recursiveDownload = (
  { path, dstpath, dry, exclude, glob }: {
    dry: boolean
    path: string
    dstpath: string
    glob: string[]
    exclude: boolean
  },
): XXX<DF.State, Deps, string> => {
  console.log(exclude)

  return pipe(
    DF.getRoot(),
    SRTE.bindW('tree', (root) =>
      pipe(
        DF.getByPathFolder(root, normalizePath(path)),
        SRTE.chain(dir => DF.getFoldersTrees([dir], Infinity)),
        SRTE.map(NA.head),
      )),
    // SRTE.chainFirstIOK(({ tree }) =>
    //   () => {
    //     log(drawFilesTree(tree))()
    //   }
    // ),
    SRTE.chainW(({ tree }) => {
      // const treeWithPath = addPathToFolderTree('/', tree)
      // const flatTree = zipFolderTreeWithPath('/', tree)

      // const files = pipe(
      //   flatTree,
      //   A.filter(guardSnd(isFile)),
      // )

      // const { left: excluded, right: valid } = pipe(
      //   files,
      //   A.partition(
      //     ([path, item]) => !micromatch.any(path, exclude),
      //   ),
      // )

      // console.log(
      //   `excluded: \n${excluded.map(_ => _[0]).join('\n')}`,
      // )

      // console.log(
      //   `valid: \n${valid.map(_ => _[0]).join('\n')}`,
      // )

      // const { left: downloadable, right: empties } = pipe(
      //   valid,
      //   A.map(mapFst(path => Path.join(dstpath, path))),
      //   A.partition(([, file]) => file.size == 0),
      // )

      // if (dry) {
      //   return SRTE.of(`Bye`)
      // }

      // const localDirs = getDirStructure(treeWithPath)

      const { dirstruct, downloadable, empties, excluded } = getJob(tree, glob, exclude)

      console.log(
        `excluded: \n${excluded.map(_ => _[0]).join('\n')}`,
      )

      console.log(
        `downloadable: \n${downloadable.map(_ => _[0]).join('\n')}`,
      )
      console.log(
        `empties: \n${empties.map(_ => _[0]).join('\n')}`,
      )
      console.log(
        `dirstruct: \n${dirstruct.join('\n')}`,
      )

      if (dry) {
        return SRTE.of(`Bye`)
      }

      return pipe(
        TE.fromIO<void, Error>(
          print(`creating local structure `),
        ),
        TE.chain(() => createDirStructure(dstpath, dirstruct)),
        TE.chainIOK(() => print(`creating empty ${empties.length} files structure `)),
        TE.chain(() => createEmptyFiles(empties.map(fst))),
        TE.chainIOK(() => print(`starting download ${downloadable.length} files `)),
        SRTE.fromTaskEither,
        SRTE.chain(() =>
          downloadFiles(
            pipe(
              downloadable,
              A.map(mapFst(path => Path.join(dstpath, path))),
            ),
          )
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
            // emptyFiles: emptyFilesPathes,
          }
        }),
        // SRTE.map(({ fail, fails, success }) => `success: ${success}, fail: ${fail}, fails: ${fails}`),
        SRTE.map(JSON.stringify),
      )
    }),
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
    TE.fromIO<void, SomeError>(loggerIO.debug(`creating ${path}`)),
    TE.chain(() =>
      TE.tryCatch(
        () => fs.mkdir(path),
        (e) => err(`cannot create ${path}: ${e}`),
      )
    ),
  )

const createDirStructure = (basedir: string, struct: string[]): TE.TaskEither<SomeError, void> => {
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
  )
}

const writeFile = (destpath: string) =>
  (readble: Readable) =>
    TE.tryCatch(
      () => {
        // const writer = createWriteStream(destpath)
        // readble.pipe(writer)
        // return TE.taskify(stream.finished)(writer)()
        return fs.writeFile(destpath, readble)
      },
      e => err(`error writing file ${destpath}: ${e}`),
    )

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
  )
}

const downloadFiles = (
  downloadable: (readonly [localpath: string, remotefile: DriveChildrenItemFile])[],
  chunkSize = 5,
): XXX<
  DF.State,
  Use<'downloadBatchM'> & Use<'getUrlStream'>,
  [E.Either<Error, void>, readonly [url: string, path: string]][]
> => {
  const filesChunks = []

  const byZone = pipe(
    downloadable,
    NA.groupBy(([, file]) => file.zone),
  )

  for (const zone of R.keys(byZone)) {
    filesChunks.push(...A.chunksOf(chunkSize)(byZone[zone]))
  }

  return pipe(
    filesChunks,
    A.map(downloadChunk),
    SRTE.sequenceArray,
    SRTE.map(a => A.flatten([...a])),
  )
}

const downloadChunk = (
  chunk: NA.NonEmptyArray<readonly [path: string, file: DriveChildrenItemFile]>,
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
        RTE.fromReaderTaskK(downloadUrls),
      ))
    }),
  )
}

const downloadUrls = (
  urlDest: Array<readonly [url: string, dest: string]>,
): RT.ReaderTask<
  Use<'getUrlStream'>,
  [E.Either<Error, void>, readonly [string, string]][]
> => {
  return pipe(
    urlDest,
    A.map(([u, d]) => downloadUrlToFile(u, d)),
    A.sequence(RT.ApplicativePar),
    RT.map(A.zip(urlDest)),
  )
}

const downloadUrlToFile = (
  url: string,
  destpath: string,
): RTE.ReaderTaskEither<Use<'getUrlStream'>, Error, void> =>
  pipe(
    RTE.ask<Use<'getUrlStream'>, Error>(),
    RTE.bindTo('api'),
    RTE.chainFirstIOK(() => loggerIO.debug(`getting ${destpath}`)),
    RTE.chainTaskEitherK(({ api }) => api.getUrlStream({ url })),
    RTE.orElseFirst((err) => RTE.fromIO(print(`[-] ${err}`))),
    RTE.chainFirstIOK(() => print(`writing ${destpath}`)),
    RTE.chainW(RTE.fromTaskEitherK(writeFile(destpath))),
    RTE.orElseFirst((err) => RTE.fromIO(print(`[-] ${err}`))),
    RTE.chainFirstIOK(() => print(`success`)),
  )
