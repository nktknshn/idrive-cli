import * as A from 'fp-ts/Array'
import { constVoid, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { isSome } from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as O from 'fp-ts/Option'
import { Api, Drive } from '../../../icloud/drive'
import * as V from '../../../icloud/drive/cache/cache-get-by-path-types'
import { DepApi, DepAskConfirmation, DepFs } from '../../../icloud/drive/deps/deps'
import { findInParentFilename2, getDrivewsid } from '../../../icloud/drive/helpers'
import * as H from '../../../icloud/drive/path-validation'
import * as T from '../../../icloud/drive/types'
import { normalizePath } from '../../../lib/normalize-path'
import { NEA, XXX } from '../../../lib/types'
import { Path } from '../../../lib/util'

type AskingFunc = (({ message }: { message: string }) => TE.TaskEither<Error, boolean>)

export type UploadActionDeps =
  & Drive.Deps
  & DepApi<'renameItems'>
  & DepApi<'moveItemsToTrash'>
  & DepApi<'moveItems'>
  & Api.UploadMethodDeps
  & DepFs<'fstat'>
  & DepAskConfirmation

export const uploads = (
  { args, overwright }: {
    args: string[]
    overwright:
      | boolean
      | AskingFunc
  },
): XXX<Drive.State, UploadActionDeps, string> => {
  const dstpath = NA.last(args as NEA<string>)
  const srcpaths = NA.init(args as NEA<string>)

  return pipe(
    Drive.getDocwsRoot(),
    SRTE.bindTo('root'),
    SRTE.bind('dst', ({ root }) => Drive.getByPathFolder(root, normalizePath(dstpath))),
    SRTE.bindW('deps', () => SRTE.ask<Drive.State, UploadActionDeps>()),
    SRTE.chain(({ dst, deps }) =>
      pipe(
        srcpaths,
        A.map(src =>
          uploadToFolder({
            dst,
            src,
            overwright: overwright ? true : deps.askConfirmation,
          })
        ),
        SRTE.sequenceArray,
      )
    ),
    SRTE.map(() => `Success. ${srcpaths}`),
  )
}

export const singleFileUpload = (
  { srcpath, dstpath, overwright }: {
    srcpath: string
    dstpath: string
    overwright: boolean
  },
): XXX<Drive.State, UploadActionDeps, string> => {
  return pipe(
    Drive.getDocwsRoot(),
    SRTE.bindTo('root'),
    SRTE.bind('dst', ({ root }) => Drive.getByPath(root, normalizePath(dstpath))),
    SRTE.bind('src', () => SRTE.of(srcpath)),
    SRTE.bind('srcstat', () => SRTE.fromReaderTaskEither((deps: UploadActionDeps) => deps.fs.fstat(srcpath))),
    SRTE.bind('overwright', () => SRTE.of(overwright)),
    SRTE.chain(handleSingleFileUpload),
    SRTE.map(() => `Success. ${Path.basename(srcpath)}`),
  )
}

const handleSingleFileUpload = (
  { src, dst, overwright }: {
    dst: V.GetByPathResult<T.DetailsDocwsRoot>
    src: string
    overwright: boolean
  },
): XXX<Drive.State, UploadActionDeps, void> => {
  // if the target path already exists at icloud drive
  if (dst.valid) {
    const dstitem = V.target(dst)

    // if it's a folder
    if (T.isFolderLike(dstitem)) {
      return uploadToFolder({ src, dst: dstitem, overwright })
    }
    // if it's a file and the overwright flag set
    else if (overwright && V.isValidWithFile(dst)) {
      return uploadOverwrighting({ src, dstitem: dst.file.value, parent: NA.last(dst.path.details) })
    }
    // otherwise we cancel uploading
    else {
      return Drive.errS(`invalid destination path: ${V.asString(dst)} It's a file`)
    }
  }

  // if the path is valid only in its parent folder
  if (dst.path.rest.length == 1) {
    // upload and rename
    const dstitem = NA.last(dst.path.details)
    const fname = NA.head(dst.path.rest)

    if (T.isFolderLike(dstitem)) {
      return pipe(
        Api.upload<Drive.State>({ sourceFilePath: src, docwsid: dstitem.docwsid, fname, zone: dstitem.zone }),
        SRTE.map(constVoid),
      )
    }
  }

  return Drive.errS(`invalid destination path: ${H.showMaybeValidPath(dst.path)}`)
}

const uploadToFolder = (
  { src, dst, overwright }: {
    overwright:
      | boolean
      | AskingFunc
    dst: T.DetailsDocwsRoot | T.NonRootDetails
    src: string
  },
): XXX<Drive.State, UploadActionDeps, void> => {
  const actualFile = pipe(
    findInParentFilename2(
      dst,
      Path.basename(src),
    ),
    O.filter(T.isFile),
  )

  if (isSome(actualFile)) {
    if (typeof overwright === 'boolean') {
      if (overwright) {
        return uploadOverwrighting({ src, dstitem: actualFile.value, parent: dst })
      }
    }
    else {
      return pipe(
        overwright({
          message: `overwright ${T.fileName(actualFile.value)}?`,
        }),
        SRTE.fromTaskEither,
        SRTE.chain(overwright => uploadToFolder({ src, dst, overwright })),
      )
    }
  }
  return pipe(
    Api.upload<Drive.State>({ sourceFilePath: src, docwsid: dst.docwsid, zone: dst.zone }),
    SRTE.map(constVoid),
  )
}

const uploadOverwrighting = (
  { src, parent, dstitem }: {
    parent: T.DetailsDocwsRoot | T.NonRootDetails
    dstitem: T.DriveChildrenItemFile
    src: string
  },
): XXX<Drive.State, UploadActionDeps, void> => {
  // const dstitem = V.target(dst)
  // const parent = NA.last(dst.path.details)

  return pipe(
    Api.upload<Drive.State>({ sourceFilePath: src, docwsid: parent.docwsid, zone: dstitem.zone }),
    SRTE.bindTo(
      'uploadResult',
    ),
    SRTE.bindW('removeResult', () => {
      return Api.moveItemsToTrash({
        items: [dstitem],
        trash: true,
      })
    }),
    SRTE.chainW(({ uploadResult }) => {
      const drivewsid = getDrivewsid(uploadResult)
      return pipe(
        Api.renameItems<Drive.State>({
          items: [{
            drivewsid,
            etag: uploadResult.etag,
            name: dstitem.name,
            extension: dstitem.extension,
          }],
        }),
        SRTE.map(constVoid),
      )
    }),
  )
}
