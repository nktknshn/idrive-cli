import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import { isSome } from 'fp-ts/lib/Option'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { fst } from 'fp-ts/lib/ReadonlyTuple'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as NA from 'fp-ts/NonEmptyArray'
import { Stats } from 'fs'
import * as V from '../../../icloud/drive/cache/cache-get-by-path-types'
import * as API from '../../../icloud/drive/deps/api-methods'
import { DepApi, DepFs } from '../../../icloud/drive/deps/deps'
import * as Drive from '../../../icloud/drive/drive'
import { findInParentFilename } from '../../../icloud/drive/helpers'
import { DetailsAppLibrary, DetailsDocwsRoot, DetailsFolder, isFolderLike } from '../../../icloud/drive/types'
import { err } from '../../../lib/errors'
import { printerIO } from '../../../lib/logging'
import { normalizePath } from '../../../lib/normalize-path'
import { NEA, XXX } from '../../../lib/types'
import { Path } from '../../../lib/util'
import { walkDirRel } from './download/walkdir'
import { createRemoteDirStructure, createUploadTask, uploadChunk } from './upload/upload-helpers'

type Argv = {
  localpath: string
  remotepath: string
  dry: boolean
  include: string[]
  exclude: string[]
  // silent: boolean
}

type Deps =
  & Drive.Deps
  & DepApi<'renameItems'>
  & DepApi<'createFolders'>
  & DepApi<'downloadBatch'>
  & API.UploadMethodDeps
  & DepFs<'fstat' | 'opendir'>

type UploadTask = {
  dirstruct: string[]
  uploadable: (readonly [string, { path: string; stats: Stats }])[]
  empties: (readonly [string, { path: string; stats: Stats }])[]
  excluded: (readonly [string, { path: string; stats: Stats }])[]
}

export type UploadResult = {
  status: { status_code: number; error_message: string }
  etag: string
  zone: string
  type: string
  document_id: string
  parent_id: string
  mtime: number
}

export const uploadFolder = (
  { localpath, remotepath, include, exclude, dry }: Argv,
): XXX<Drive.State, Deps, unknown> => {
  return pipe(
    Drive.getDocwsRoot(),
    SRTE.bindTo('root'),
    SRTE.bindW('dst', ({ root }) => Drive.getByPath(root, normalizePath(remotepath))),
    SRTE.bindW('src', () => SRTE.of(localpath)),
    SRTE.bindW('args', () => SRTE.of({ localpath, remotepath, include, exclude, dry })),
    SRTE.chainW(handleUploadFolder),
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
    RTE.map(createUploadTask(args)),
  )

  if (args.dry) {
    return SRTE.fromReaderTaskEither(pipe(
      uploadTask,
      RTE.chainIOK(
        ({ uploadable, excluded, empties }) =>
          printerIO.print(
            `excluded:\n${excluded.map(fst).join('\n').length} items\n\nempties:\n${
              empties.map(fst).join('\n')
            }\n\nuploadable:\n${uploadable.map(fst).join('\n')}`,
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
        SRTE.chain(uploadToNewFolder(dstitem, dirname, src)),
      )
    }
  }
  else if (dst.path.rest.length == 1) {
    const dstitem = NA.last(dst.path.details)
    const dirname = NA.head(dst.path.rest)

    return pipe(
      uploadTask,
      SRTE.fromReaderTaskEither,
      SRTE.chain(uploadToNewFolder(dstitem, dirname, src)),
    )
  }

  return SRTE.left(err(`invalid dest location`))
}

const uploadToNewFolder = (
  dstitem: DetailsDocwsRoot | DetailsFolder | DetailsAppLibrary,
  dirname: string,
  src: string,
): (
  task: UploadTask,
) => XXX<Drive.State, Deps, NEA<UploadResult>[]> =>
  (task: UploadTask) =>
    pipe(
      SRTE.of<Drive.State, Deps, Error, UploadTask>(
        task,
      ),
      SRTE.bindTo('task'),
      SRTE.bindW('uploadRoot', () =>
        API.createFoldersFailing<Drive.State>({
          names: [dirname],
          destinationDrivewsId: dstitem.drivewsid,
        })),
      SRTE.bindW(
        'dirs',
        ({ uploadRoot, task }) =>
          pipe(
            printerIO.print(`creating dir structure`),
            SRTE.fromIO,
            SRTE.chain(() =>
              createRemoteDirStructure(
                uploadRoot[0].drivewsid,
                task.dirstruct,
              )
            ),
          ),
      ),
      SRTE.chainW(({ task, dirs }) => {
        return pipe(
          task.uploadable,
          A.map(([remotepath, c]) => [remotepath, { ...c, path: Path.join(src, c.path) }] as const),
          A.chunksOf(5),
          A.map(uploadChunk(dirs)),
          A.sequence(SRTE.Applicative),
        )
      }),
    )
