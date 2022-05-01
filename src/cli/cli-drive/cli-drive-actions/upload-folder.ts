import * as A from 'fp-ts/lib/Array'
import { constant, pipe } from 'fp-ts/lib/function'
import { isSome } from 'fp-ts/lib/Option'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { fst, mapSnd } from 'fp-ts/lib/ReadonlyTuple'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as NA from 'fp-ts/NonEmptyArray'
import { DepFs } from '../../../icloud/deps'
import { DriveApi, DriveQuery } from '../../../icloud/drive'
import { DepDriveApi } from '../../../icloud/drive/drive-api/deps'
import * as V from '../../../icloud/drive/get-by-path-types'
import { findInParentFilename } from '../../../icloud/drive/helpers'
import {
  DetailsAppLibrary,
  DetailsDocwsRoot,
  DetailsFolder,
  isFolderLike,
} from '../../../icloud/drive/icloud-drive-types'
import { err } from '../../../util/errors'
import { loggerIO } from '../../../util/loggerIO'
import { printerIO } from '../../../util/logging'
import { normalizePath } from '../../../util/normalize-path'
import { Path } from '../../../util/path'
import { XXX } from '../../../util/types'
import { walkDirRel } from './download/walkdir'
import {
  createRemoteDirStructure,
  getUploadTask,
  showUploadTask,
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
  chunkSize: number
}

export type Deps =
  & DriveQuery.Deps
  & DepDriveApi<'renameItems'>
  & DepDriveApi<'createFolders'>
  & DepDriveApi<'downloadBatch'>
  & DriveApi.UploadMethodDeps
  & DepFs<'fstat' | 'opendir'>

export const uploadFolder = (
  argv: Argv,
): XXX<DriveQuery.State, Deps, unknown> => {
  return pipe(
    DriveQuery.getByPathDocwsroot(normalizePath(argv.remotepath)),
    SRTE.bindTo('dst'),
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
): XXX<DriveQuery.State, Deps, UploadResult[]> => {
  const dirname = Path.parse(src).base

  const uploadTask = pipe(
    walkDirRel(src),
    RTE.map(getUploadTask(args)),
  )

  if (args.dry) {
    return SRTE.fromReaderTaskEither(pipe(
      uploadTask,
      RTE.chainIOK((task) => printerIO.print(showUploadTask(task))),
      RTE.map(constant([])),
    ))
  }

  if (dst.valid) {
    const dstitem = V.pathTarget(dst)

    if (isFolderLike(dstitem)) {
      if (isSome(findInParentFilename(dstitem, dirname))) {
        return SRTE.left(err(`${args.remotepath} already contains an item named ${dirname}`))
      }

      return pipe(
        uploadTask,
        SRTE.fromReaderTaskEither,
        SRTE.chain(
          uploadToNewFolder({ dstitem, dirname, src, chunkSize: args.chunkSize, remotepath: args.remotepath }),
        ),
      )
    }
  }
  else if (dst.rest.length == 1) {
    const dstitem = NA.last(dst.details)
    const dirname = NA.head(dst.rest)

    return pipe(
      uploadTask,
      SRTE.fromReaderTaskEither,
      SRTE.chain(uploadToNewFolder({ dstitem, dirname, src, chunkSize: args.chunkSize, remotepath: args.remotepath })),
    )
  }

  return SRTE.left(err(`invalid dest location`))
}

const uploadToNewFolder = (
  { dirname, dstitem, src, chunkSize, remotepath }: {
    dstitem: DetailsDocwsRoot | DetailsFolder | DetailsAppLibrary
    dirname: string
    src: string
    chunkSize: number
    remotepath: string
  },
): (
  task: UploadTask,
) => XXX<DriveQuery.State, Deps, UploadResult[]> =>
  (task: UploadTask) =>
    pipe(
      printerIO.print(`creating folder ${remotepath}`),
      SRTE.fromIO,
      SRTE.chain(() =>
        DriveApi.createFoldersStrict<DriveQuery.State>({
          names: [dirname],
          destinationDrivewsId: dstitem.drivewsid,
        })
      ),
      SRTE.bindTo('newFolder'),
      SRTE.bind(
        'pathToDrivewsid',
        ({ newFolder }) =>
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
      SRTE.chainW(({ pathToDrivewsid }) => {
        return pipe(
          task.uploadable,
          A.map(mapSnd(local => ({
            ...local,
            path: Path.join(src, local.path),
          }))),
          A.chunksOf(chunkSize),
          A.map(chunk =>
            pipe(
              loggerIO.debug(`starting uploading a chunk of ${chunkSize} files`),
              SRTE.fromIO,
              SRTE.chain(() => uploadChunkPar(pathToDrivewsid)(chunk)),
            )
          ),
          A.sequence(SRTE.Applicative),
          SRTE.map(A.flatten),
        )
      }),
    )
