import * as A from 'fp-ts/lib/Array'
import { constant, pipe } from 'fp-ts/lib/function'
import { isSome } from 'fp-ts/lib/Option'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { mapSnd } from 'fp-ts/lib/ReadonlyTuple'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as NA from 'fp-ts/NonEmptyArray'

import { DepFs } from '../../deps-types'
import { loggerIO } from '../../logging/loggerIO'
import { printerIO } from '../../logging/printerIO'
import { err } from '../../util/errors'
import { normalizePath } from '../../util/normalize-path'
import { Path } from '../../util/path'
import { SRA } from '../../util/types'
import { walkDirRel } from '../../util/walkdir'
import { DriveLookup, Types } from '..'
import { DepApiMethod, DriveApiMethods } from '../drive-api'
import { findInParentFilename } from '../util/drive-helpers'
import * as V from '../util/get-by-path-types'
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
  & DriveLookup.Deps
  & DepApiMethod<'renameItems'>
  & DepApiMethod<'createFolders'>
  & DepApiMethod<'downloadBatch'>
  & DepApiMethod<'upload'>
  & DepFs<'fstat' | 'opendir'>

export const uploadFolder = (
  argv: Argv,
): SRA<DriveLookup.State, Deps, unknown> => {
  return pipe(
    DriveLookup.getByPathDocwsroot(normalizePath(argv.remotepath)),
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
    dst: V.GetByPathResult<Types.DetailsDocwsRoot>
    args: Argv
  },
): SRA<DriveLookup.State, Deps, UploadResult[]> => {
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

    if (Types.isFolderLike(dstitem)) {
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
    dstitem: Types.DetailsDocwsRoot | Types.DetailsFolder | Types.DetailsAppLibrary
    dirname: string
    src: string
    chunkSize: number
    remotepath: string
  },
): (
  task: UploadTask,
) => DriveLookup.Lookup<UploadResult[], Deps> =>
  (task: UploadTask) =>
    pipe(
      printerIO.print(`creating folder ${remotepath}`),
      SRTE.fromIO,
      SRTE.chain(() =>
        DriveApiMethods.createFoldersStrict<DriveLookup.State>({
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
