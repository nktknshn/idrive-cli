import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { constUndefined, constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as RT from 'fp-ts/lib/ReaderTask'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { fst } from 'fp-ts/lib/ReadonlyTuple'
import { Eq } from 'fp-ts/lib/string'
import * as TE from 'fp-ts/lib/TaskEither'
import * as TR from 'fp-ts/lib/Tree'
import { createWriteStream, Stats } from 'fs'
import micromatch from 'micromatch'
import { Readable } from 'stream'
import * as API from '../../../../icloud/drive/deps/api-methods'
import { DepFetchClient } from '../../../../icloud/drive/deps/util'
import * as DF from '../../../../icloud/drive/drive'
import { FolderTree, zipFolderTreeWithPath } from '../../../../icloud/drive/drive-methods/get-folders-trees'
import * as T from '../../../../icloud/drive/types'
import { err, SomeError } from '../../../../lib/errors'
import { DepFs, DepFsType } from '../../../../lib/fs'
// import { fstat, mkdir as mkdirTask, writeFile } from '../../../../lib/fs'
import { loggerIO } from '../../../../lib/loggerIO'
import { printerIO } from '../../../../lib/logging'
import { XXX } from '../../../../lib/types'
import { guardSnd, hasOwnProperty, Path } from '../../../../lib/util'
import { normalizePath, stripTrailingSlash } from '../helpers'

export type DownloadICloudFilesFunc<R> = (task: { downloadable: { info: DownloadInfo; localpath: string }[] }) => XXX<
  DF.State,
  R,
  [E.Either<Error, void>, readonly [url: string, path: string]][]
>

export type DownloadInfo = (readonly [remotepath: string, remotefile: T.DriveChildrenItemFile])

export type DownloadStructure = {
  dirstruct: string[]
  downloadable: DownloadInfo[]
  empties: DownloadInfo[]
}

export type FilterTreeResult = DownloadStructure & {
  excluded: DownloadInfo[]
}

export type DownloadTask = {
  localdirstruct: string[]
  downloadable: { info: DownloadInfo; localpath: string }[]
  empties: { info: DownloadInfo; localpath: string }[]
}

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

export const writeFile2 = (destpath: string) =>
  (readble: Readable): TE.TaskEither<SomeError, void> =>
    TE.tryCatch(
      () => {
        // const writer = createWriteStream(destpath)
        // readble.pipe(writer)
        // return TE.taskify(stream.finished)(writer)()
        return new Promise(
          (resolve, reject) => {
            const stream = createWriteStream(destpath)
            readble.pipe(stream).on('close', resolve)
          },
        )
      },
      e => err(`error writing file ${destpath}: ${e}`),
    )

export type DownloadUrlToFile<R> = (
  url: string,
  destpath: string,
) => RTE.ReaderTaskEither<R, Error, void>

export const downloadUrlToFile: DownloadUrlToFile<DepFetchClient> = (
  url: string,
  destpath: string,
): RTE.ReaderTaskEither<DepFetchClient, Error, void> =>
  pipe(
    loggerIO.debug(`getting ${destpath}`),
    RTE.fromIO,
    RTE.chain(() => API.getUrlStream({ url })),
    RTE.orElseFirst((err) => RTE.fromIO(printerIO.print(`[-] ${err}`))),
    RTE.chainFirstIOK(() => printerIO.print(`writing ${destpath}`)),
    RTE.chainW(RTE.fromTaskEitherK(writeFile2(destpath))),
    RTE.orElseFirst((err) => RTE.fromIO(printerIO.print(`[-] ${err}`))),
  )

export const downloadUrlsPar = (
  urlDest: Array<readonly [url: string, dest: string]>,
): RT.ReaderTask<
  DepFetchClient,
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

export const isEnoentError = (e: Error) => hasOwnProperty(e, 'code') && e.code === 'ENOENT'

export const isEexistError = (e: Error) => hasOwnProperty(e, 'code') && e.code === 'EEXIST'

export const createDirStructure = (
  basedir: string,
  struct: string[],
): RTE.ReaderTaskEither<DepFs<'mkdir' | 'fstat'>, SomeError, void> =>
  ({ fs: { mkdir: mkdirTask, fstat } }) => {
    const paths = pipe(
      struct,
      A.map(s => Path.join(basedir, s)),
      A.filter(_ => normalizePath(_) !== normalizePath(basedir)),
    )

    const mkdir = flow(
      mkdirTask,
      TE.orElseW(e =>
        isEexistError(e)
          ? TE.of(constVoid())
          : TE.left(e)
      ),
    )

    return pipe(
      fstat(basedir),
      TE.filterOrElse(
        s => s.isDirectory(),
        () => err(`${basedir} is not a directory`),
      ),
      TE.map(() => pipe(paths, A.map(mkdir))),
      TE.chain(TE.sequenceSeqArray),
      TE.map(constVoid),
    )
  }

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

export type LocalTreeElement =
  | {
    readonly type: 'file'
    path: string
    name: string
    stats: Stats
  }
  | {
    readonly type: 'directory'
    path: string
    name: string
    stats: Stats
  }

export const showLocalTreeElement = (el: LocalTreeElement) => `${el.type} {path: ${el.path}, name: ${el.name}}`

export const walkDirRel = (
  dstpath: string,
): RTE.ReaderTaskEither<DepFs<'fstat' | 'opendir'>, Error, TR.Tree<LocalTreeElement>> => {
  const np = stripTrailingSlash(Path.normalize(dstpath))

  return pipe(
    walkDir(np),
    // TE.map(_ => _.forest),
    RTE.map(
      TR.map(
        tree => ({
          ...tree,
          path: tree.path.substring(
            np.length,
          ),
        }),
      ),
    ),
  )
}

export const walkDir = (path: string): RTE.ReaderTaskEither<
  DepFs<'fstat' | 'opendir'>,
  Error,
  TR.Tree<LocalTreeElement>
> =>
  RTE.asksReaderTaskEitherW(({ fs }: DepFs<'fstat' | 'opendir'>) =>
    pipe(
      fs.opendir(path),
      TE.chain(dir =>
        TE.fromTask(
          async () => {
            let items: TR.Forest<LocalTreeElement> = []

            for await (const dirent of dir) {
              const itemPath = Path.join(
                dir.path,
                dirent.name,
              )

              const stats = await fs.fstat(itemPath)()

              if (E.isLeft(stats)) {
                throw stats.left
              }

              if (dirent.isFile()) {
                items.push(TR.make(
                  {
                    type: 'file',
                    path: itemPath,
                    name: dirent.name,
                    stats: stats.right,
                  },
                ))
              }
              else if (dirent.isDirectory()) {
                const dirTree = await walkDir(itemPath)({ fs })()

                if (E.isLeft(dirTree)) {
                  throw dirTree.left
                }

                items.push(dirTree.right)
              }
            }

            const stats = await fs.fstat(dir.path)()
            if (E.isLeft(stats)) {
              throw stats.left
            }

            return TR.make(
              {
                type: 'directory' as const,
                path: dir.path + '/',
                name: Path.basename(dir.path),
                stats: stats.right,
              },
              items,
            )
          },
        )
      ),
      RTE.fromTaskEither,
    )
  )

/*

const getDirStructure = <T extends T.Details>(
  tree: TR.Tree<FolderTreeValue<T> & { path: string }>,
): string[] => {
  return [
    `${tree.value.path}`,
    ...pipe(tree.forest, A.map(getDirStructure), A.flatten),
  ]
} */

export const prepareDestinationDir = (dstpath: string): RTE.ReaderTaskEither<DepFsType, Error, void> =>
  ({ fstat, mkdir }) => {
    const basedir = Path.parse(dstpath).dir

    return pipe(
      TE.Do,
      TE.bind('dst', () =>
        pipe(
          fstat(dstpath),
          TE.matchE(
            (e) => isEnoentError(e) ? TE.of(false) : TE.left(e),
            () => TE.of(true),
          ),
        )),
      TE.bind('parent', () => fstat(basedir)),
      TE.chain(({ dst }) =>
        dst
          ? TE.of(constVoid())
          : pipe(mkdir(dstpath), TE.map(constVoid))
      ),
    )
  }
