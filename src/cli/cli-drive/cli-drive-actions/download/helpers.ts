import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as RT from 'fp-ts/lib/ReaderTask'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { fst } from 'fp-ts/lib/ReadonlyTuple'
import { Eq } from 'fp-ts/lib/string'
import * as TE from 'fp-ts/lib/TaskEither'
import * as TR from 'fp-ts/lib/Tree'
import { Stats } from 'fs'
import * as fs from 'fs/promises'
import micromatch from 'micromatch'
import { Readable } from 'stream'
import { Use } from '../../../../icloud/drive/api/type'
import { FolderTree, zipFolderTreeWithPath } from '../../../../icloud/drive/drive/get-folders-trees'
import { guardSnd } from '../../../../icloud/drive/helpers'
import * as T from '../../../../icloud/drive/requests/types/types'
import { err, SomeError } from '../../../../lib/errors'
import { loggerIO } from '../../../../lib/loggerIO'
import { printerIO } from '../../../../lib/logging'
import { hasOwnProperty, Path } from '../../../../lib/util'
import { normalizePath, stripTrailingSlash } from '../helpers'

export type DownloadInto = (readonly [localpath: string, remotefile: T.DriveChildrenItemFile])

export type FilterTreeResult = {
  dirstruct: string[]
  downloadable: DownloadInto[]
  empties: DownloadInto[]
  excluded: DownloadInto[]
}

export const mkdirTask = (path: string) =>
  pipe(
    TE.fromIO<void, SomeError>(loggerIO.debug(`creating ${path}`)),
    TE.chain(() =>
      TE.tryCatch(
        () => fs.mkdir(path),
        (e) => e instanceof Error ? e : err(`cannot create ${path}: ${e}`),
      )
    ),
  )

export const writeFile = (destpath: string) =>
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

export type DownloadUrlToFile<R> = (
  url: string,
  destpath: string,
) => RTE.ReaderTaskEither<R, Error, void>

export const downloadUrlToFile: DownloadUrlToFile<Use<'getUrlStream'>> = (
  url: string,
  destpath: string,
): RTE.ReaderTaskEither<Use<'getUrlStream'>, Error, void> =>
  pipe(
    RTE.ask<Use<'getUrlStream'>, Error>(),
    RTE.bindTo('api'),
    RTE.chainFirstIOK(() => loggerIO.debug(`getting ${destpath}`)),
    RTE.chainTaskEitherK(({ api }) => api.getUrlStream({ url })),
    RTE.orElseFirst((err) => RTE.fromIO(printerIO.print(`[-] ${err}`))),
    RTE.chainFirstIOK(() => printerIO.print(`writing ${destpath}`)),
    RTE.chainW(RTE.fromTaskEitherK(writeFile(destpath))),
    RTE.orElseFirst((err) => RTE.fromIO(printerIO.print(`[-] ${err}`))),
  )

export const downloadUrlsPar = (
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

export const createEmptyFiles = (dstpath: string, paths: string[]) => {
  return pipe(
    paths,
    A.map(p => Path.join(dstpath, p)),
    A.map(path =>
      TE.tryCatch(
        () => fs.writeFile(path, ''),
        e => err(`error writing file ${path}: ${e}`),
      )
    ),
    A.sequence(TE.ApplicativePar),
  )
}

export const fstat = (path: string) =>
  TE.tryCatch(
    () => fs.stat(path),
    (e) => e instanceof Error ? e : err(`error getting stats: ${e}`),
  )

export const isEnoentError = (e: Error) => hasOwnProperty(e, 'code') && e.code === 'ENOENT'

export const isEexistError = (e: Error) => hasOwnProperty(e, 'code') && e.code === 'EEXIST'

export const createDirStructure = (
  basedir: string,
  struct: string[],
): TE.TaskEither<SomeError, void> => {
  const paths = pipe(
    struct,
    A.map(s => Path.join(basedir, s)),
    A.filter(_ => normalizePath(_) !== normalizePath(basedir)),
  )

  const mkdir = flow(
    mkdirTask,
    TE.orElse(e =>
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

export const filterTree = (
  tree: FolderTree<T.DetailsDocwsRoot | T.NonRootDetails>,
  glob: string[],
  exclude: boolean,
): FilterTreeResult => {
  const flatTree = zipFolderTreeWithPath('/', tree)

  const files = pipe(
    flatTree,
    A.filter(guardSnd(T.isFile)),
  )

  const folders = pipe(
    flatTree,
    A.filter(guardSnd(T.isFolderLike)),
  )

  const { left: excluded, right: valid } = glob.length > 0
    ? pipe(
      files,
      A.partition(
        ([path, item]) =>
          exclude
            ? !micromatch.any(path, glob)
            : micromatch.any(path, glob),
      ),
    )
    : { left: [], right: files }

  const { left: downloadable, right: empties } = pipe(
    valid,
    A.partition(([, file]) => file.size == 0),
  )

  const dirstruct = pipe(
    A.concatW(folders)(A.concat(downloadable)(empties)),
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

const opendir = (path: string) =>
  TE.tryCatch(
    () => fs.opendir(path),
    reason => err(`cant open dir ${reason}`),
  )

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

export const walkDirRel = (dstpath: string): TE.TaskEither<Error, TR.Tree<LocalTreeElement>> => {
  const np = stripTrailingSlash(Path.normalize(dstpath))

  return pipe(
    walkDir(np),
    // TE.map(_ => _.forest),
    TE.map(
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

export const walkDir = (path: string): TE.TaskEither<Error, TR.Tree<LocalTreeElement>> =>
  pipe(
    opendir(path),
    TE.chain(dir =>
      TE.fromTask(
        async () => {
          let items: TR.Forest<LocalTreeElement> = []

          for await (const dirent of dir) {
            const itemPath = Path.join(
              dir.path,
              dirent.name,
            )

            const stats = await fs.stat(itemPath)

            if (dirent.isFile()) {
              items.push(TR.make(
                {
                  type: 'file',
                  path: itemPath,
                  name: dirent.name,
                  stats,
                },
              ))
            }
            else if (dirent.isDirectory()) {
              const dirTree = await walkDir(itemPath)()

              if (E.isLeft(dirTree)) {
                throw dirTree.left
              }

              items.push(dirTree.right)
            }
          }

          const stats = await fs.stat(dir.path)

          return TR.make(
            {
              type: 'directory' as const,
              path: dir.path,
              name: Path.basename(dir.path),
              stats,
            },
            items,
          )
        },
      )
    ),
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

export const prepareDestinationDir = (dstpath: string): TE.TaskEither<Error, void> => {
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
        : mkdirTask(dstpath)
    ),
  )
}
