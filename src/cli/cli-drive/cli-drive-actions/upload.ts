import * as A from 'fp-ts/Array'
import { constVoid, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { isSome } from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as O from 'fp-ts/Option'
import * as V from '../../../icloud/drive/cache/cache-get-by-path-types'
import * as API from '../../../icloud/drive/deps/api-methods'
import { DepApi } from '../../../icloud/drive/deps/api-type'
import * as Drive from '../../../icloud/drive/drive'
import { findInParentFilename2, getDrivewsid, parseName } from '../../../icloud/drive/helpers'
import * as T from '../../../icloud/drive/types'
import { DepFs } from '../../../lib/fs'
import * as H from '../../../lib/path-validation'
import { NEA, XXX } from '../../../lib/types'
import { Path } from '../../../lib/util'
import { askConfirmation, normalizePath } from './helpers'

type AskingFunc = (({ message }: { message: string }) => TE.TaskEither<Error, boolean>)

type Deps =
  & Drive.Deps
  & DepApi<'renameItems'>
  & DepApi<'moveItemsToTrash'>
  & API.UploadMethodDeps
  & DepFs<'fstat'>

export const uploads = (
  { args, overwright }: {
    args: string[]
    overwright:
      | boolean
      | AskingFunc
  },
): XXX<Drive.State, Deps, string> => {
  const dstpath = NA.last(args as NEA<string>)
  const srcpaths = NA.init(args as NEA<string>)

  return pipe(
    Drive.getDocwsRoot(),
    SRTE.bindTo('root'),
    SRTE.bindW('dst', ({ root }) => Drive.getByPathFolder(root, normalizePath(dstpath))),
    SRTE.chainW(({ dst }) =>
      pipe(
        srcpaths,
        A.map(src =>
          uploadToFolder({
            dst,
            src,
            overwright: overwright ? true : askConfirmation,
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
): XXX<Drive.State, Deps, string> => {
  return pipe(
    Drive.getDocwsRoot(),
    SRTE.bindTo('root'),
    SRTE.bindW('dst', ({ root }) => Drive.getByPath(root, normalizePath(dstpath))),
    SRTE.bindW('src', () => SRTE.of(srcpath)),
    SRTE.bindW('srcstat', () => SRTE.fromReaderTaskEither((deps: Deps) => deps.fs.fstat(srcpath))),
    SRTE.bindW('overwright', () => SRTE.of(overwright)),
    SRTE.chainW(handleSingleFileUpload),
    SRTE.map(() => `Success. ${Path.basename(srcpath)}`),
  )
}

const handleSingleFileUpload = (
  { src, dst, overwright }: {
    dst: V.GetByPathResult<T.DetailsDocwsRoot>
    src: string
    overwright: boolean
  },
): XXX<Drive.State, Deps, void> => {
  // if the target path is presented at icloud drive
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
        API.upload<Drive.State>({ sourceFilePath: src, docwsid: dstitem.docwsid, fname, zone: dstitem.zone }),
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
): XXX<Drive.State, Deps, void> => {
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
    API.upload<Drive.State>({ sourceFilePath: src, docwsid: dst.docwsid, zone: dst.zone }),
    SRTE.map(constVoid),
  )
}

const uploadOverwrighting = (
  { src, parent, dstitem }: {
    parent: T.DetailsDocwsRoot | T.NonRootDetails
    dstitem: T.DriveChildrenItemFile
    src: string
  },
): XXX<Drive.State, Deps, void> => {
  // const dstitem = V.target(dst)
  // const parent = NA.last(dst.path.details)

  return pipe(
    API.upload<Drive.State>({ sourceFilePath: src, docwsid: parent.docwsid, zone: dstitem.zone }),
    SRTE.bindTo(
      'uploadResult',
    ),
    SRTE.bindW('removeResult', () => {
      return API.moveItemsToTrash({
        items: [dstitem],
        trash: true,
      })
    }),
    SRTE.chainW(({ uploadResult }) => {
      const drivewsid = getDrivewsid(uploadResult)
      return pipe(
        API.moveItemsToTrash<Drive.State>({
          items: [{
            drivewsid,
            etag: uploadResult.etag,
            ...parseName(T.fileName(dstitem)),
          }],
        }),
        SRTE.map(constVoid),
      )
    }),
  )
}
