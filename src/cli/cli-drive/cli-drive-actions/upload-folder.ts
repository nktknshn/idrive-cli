import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import { isSome } from 'fp-ts/lib/Option'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { fst, mapSnd } from 'fp-ts/lib/ReadonlyTuple'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as NA from 'fp-ts/NonEmptyArray'
import { Api } from '../../../icloud/drive'
import * as V from '../../../icloud/drive/cache/cache-get-by-path-types'
import { DepApi, DepFs } from '../../../icloud/drive/deps'
import * as Drive from '../../../icloud/drive/drive'
import { findInParentFilename } from '../../../icloud/drive/helpers'
import { DetailsAppLibrary, DetailsDocwsRoot, DetailsFolder, isFolderLike } from '../../../icloud/drive/types'
import { err } from '../../../lib/errors'
import { loggerIO } from '../../../lib/loggerIO'
import { printerIO } from '../../../lib/logging'
import { normalizePath } from '../../../lib/normalize-path'
import { NEA, XXX } from '../../../lib/types'
import { Path } from '../../../lib/util'
import { walkDirRel } from './download/walkdir'
import {
  createRemoteDirStructure,
  getDirStructTask,
  getUploadTask,
  uploadChunkPar,
  UploadResult,
  UploadTask,
} from './upload/upload-helpers'

type Argv = {
  localpath: string
  remotepath: string
  dry: boolean
  include: string[]
  exclude: string[]
  parChunks: number
  // silent: boolean
}

type Deps =
  & Drive.Deps
  & DepApi<'renameItems'>
  & DepApi<'createFolders'>
  & DepApi<'downloadBatch'>
  & Api.UploadMethodDeps
  & DepFs<'fstat' | 'opendir'>

export const uploadFolder = (
  argv: Argv,
): XXX<Drive.State, Deps, unknown> => {
  return pipe(
    Drive.getDocwsRoot(),
    SRTE.bindTo('root'),
    SRTE.bind('dst', ({ root }) => Drive.getByPath(root, normalizePath(argv.remotepath))),
    SRTE.bind('src', () => SRTE.of(argv.localpath)),
    SRTE.bind('args', () => SRTE.of(argv)),
    SRTE.chain(handleUploadFolder),
    SRTE.map((res) => `Success.`),
  )
}

const handleUploadFolder = (
  { src, dst, args }: {
    src: string
    dst: V.GetByPathResult<DetailsDocwsRoot>
    args: Argv
  },
): XXX<Drive.State, Deps, unknown> => {
  const dirname = Path.parse(src).base

  const uploadTask = pipe(
    walkDirRel(src),
    RTE.map(getUploadTask(args)),
  )

  if (args.dry) {
    return SRTE.fromReaderTaskEither(pipe(
      uploadTask,
      RTE.chainIOK(
        ({ uploadable, excluded, empties, dirstruct }) =>
          printerIO.print(
            `excluded:\n${excluded.map(fst).join('\n').length} items\n\nempties:\n${
              empties.map(fst).join('\n')
            }\n\nuploadable:\n${
              uploadable.map(fst).join('\n')
              + `\n\ndirstruct: `
              + `${dirstruct.join('\n')}`
              + `\n\n`
              + getDirStructTask(dirstruct)
                .map(([parent, kids]) => `${parent}: ${kids}`)
                .join('\n')
            }`,
          ),
      ),
    ))
  }

  if (dst.valid) {
    const dstitem = V.target(dst)

    if (isFolderLike(dstitem)) {
      if (isSome(findInParentFilename(dstitem, dirname))) {
        return SRTE.left(err(`${args.remotepath} already contains an item named ${dirname}`))
      }

      return pipe(
        uploadTask,
        SRTE.fromReaderTaskEither,
        SRTE.chain(
          uploadToNewFolder({ dstitem, dirname, src, parChunks: args.parChunks, remotepath: args.remotepath }),
        ),
      )
    }
  }
  else if (dst.path.rest.length == 1) {
    const dstitem = NA.last(dst.path.details)
    const dirname = NA.head(dst.path.rest)

    return pipe(
      uploadTask,
      SRTE.fromReaderTaskEither,
      SRTE.chain(uploadToNewFolder({ dstitem, dirname, src, parChunks: args.parChunks, remotepath: args.remotepath })),
    )
  }

  return SRTE.left(err(`invalid dest location`))
}

const uploadToNewFolder = (
  { dirname, dstitem, src, parChunks, remotepath }: {
    dstitem: DetailsDocwsRoot | DetailsFolder | DetailsAppLibrary
    dirname: string
    src: string
    parChunks: number
    remotepath: string
  },
): (
  task: UploadTask,
) => XXX<Drive.State, Deps, NEA<UploadResult>[]> =>
  (task: UploadTask) =>
    pipe(
      SRTE.of<Drive.State, Deps, Error, UploadTask>(
        task,
      ),
      SRTE.bindTo('task'),
      SRTE.bindW('newFolder', () =>
        pipe(
          printerIO.print(`creating folder ${remotepath}`),
          SRTE.fromIO,
          SRTE.chain(() =>
            Api.createFoldersFailing({
              names: [dirname],
              destinationDrivewsId: dstitem.drivewsid,
            })
          ),
        )),
      SRTE.bindW(
        'pathToDrivewsid',
        ({ newFolder, task }) =>
          pipe(
            printerIO.print(`creating dir structure in ${dirname}`),
            SRTE.fromIO,
            SRTE.chain(() =>
              createRemoteDirStructure(
                NA.head(newFolder).drivewsid,
                task.dirstruct,
              )
            ),
          ),
      ),
      SRTE.chainW(({ task, pathToDrivewsid }) => {
        return pipe(
          task.uploadable,
          A.map(mapSnd(local => ({
            ...local,
            path: Path.join(src, local.path),
          }))),
          A.chunksOf(parChunks),
          A.map(chunk =>
            pipe(
              loggerIO.debug(`starting uploading a chunk of ${parChunks} files`),
              SRTE.fromIO,
              SRTE.chain(() => uploadChunkPar(pathToDrivewsid)(chunk)),
            )
          ),
          A.sequence(SRTE.Applicative),
        )
      }),
    )
