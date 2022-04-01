import assert from 'assert'
import * as A from 'fp-ts/Array'
import { constVoid, pipe } from 'fp-ts/lib/function'
import { IO } from 'fp-ts/lib/IO'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { isSome } from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as O from 'fp-ts/Option'
import { Api, Drive } from '../../../icloud/drive'
import * as V from '../../../icloud/drive/cache/cache-get-by-path-types'
import { DepApi, DepAskConfirmation, DepFs } from '../../../icloud/drive/deps'
import { findInParentFilename, getDrivewsid } from '../../../icloud/drive/helpers'
import * as T from '../../../icloud/drive/types'
import { loggerIO } from '../../../util/loggerIO'
import { normalizePath } from '../../../util/normalize-path'
import { NEA, XXX } from '../../../util/types'
import { Path } from '../../../util/util'

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
  { uploadargs, overwright, skipTrash }: {
    uploadargs: string[]
    overwright:
      | boolean
      | AskingFunc
    skipTrash: boolean
  },
): XXX<Drive.State, UploadActionDeps, string> => {
  assert(A.isNonEmpty(uploadargs))
  assert(uploadargs.length > 1)

  const dstpath = NA.last(uploadargs)
  const srcpaths = NA.init(uploadargs)

  return pipe(
    Drive.getDocwsRoot(),
    SRTE.bindTo('root'),
    SRTE.bind('dst', ({ root }) => Drive.getByPathFolder(root, normalizePath(dstpath))),
    SRTE.bindW('deps', () => SRTE.ask<Drive.State, UploadActionDeps>()),
    SRTE.chain(({ dst, deps }) =>
      pipe(
        srcpaths,
        A.map(src => uploadToFolder({ dst, src, overwright: overwright ? true : deps.askConfirmation, skipTrash })),
        SRTE.sequenceArray,
      )
    ),
    SRTE.map(() => `Success. ${srcpaths}`),
  )
}

export const singleFileUpload = (
  { srcpath, dstpath, overwright, skipTrash }: {
    srcpath: string
    dstpath: string
    overwright: boolean
    skipTrash: boolean
  },
): XXX<Drive.State, UploadActionDeps, string> => {
  return pipe(
    Drive.getDocwsRoot(),
    SRTE.bindTo('root'),
    SRTE.bind('dst', ({ root }) => Drive.getByPath(root, normalizePath(dstpath))),
    SRTE.bind('src', () => SRTE.of(srcpath)),
    SRTE.bind('srcstat', () => SRTE.fromReaderTaskEither((deps: UploadActionDeps) => deps.fs.fstat(srcpath))),
    SRTE.bind('overwright', () => SRTE.of(overwright)),
    SRTE.bind('skipTrash', () => SRTE.of(skipTrash)),
    SRTE.chain(handleSingleFileUpload),
    SRTE.map(() => `Success. ${Path.basename(srcpath)}`),
  )
}

const handleSingleFileUpload = (
  { src, dst, overwright, skipTrash }: {
    dst: V.GetByPathResult<T.DetailsDocwsRoot>
    src: string
    overwright: boolean
    skipTrash: boolean
  },
): XXX<Drive.State, UploadActionDeps, void> => {
  // if the target path already exists at icloud drive
  if (dst.valid) {
    const dstitem = V.pathTarget(dst)

    // if it's a folder
    if (T.isFolderLike(dstitem)) {
      return uploadToFolder({ src, dst: dstitem, overwright, skipTrash })
    }
    // if it's a file and the overwright flag set
    else if (overwright && V.isValidWithFile(dst)) {
      return uploadOverwrighting({ src, dstitem: dst.file.value, parent: NA.last(dst.details), skipTrash })
    }
    // otherwise we cancel uploading
    else {
      return Drive.errS(`invalid destination path: ${V.asString(dst)} It's a file`)
    }
  }

  // if the path is valid only in its parent folder
  if (dst.rest.length == 1) {
    // upload and rename
    const dstitem = NA.last(dst.details)
    const fname = NA.head(dst.rest)

    if (T.isFolderLike(dstitem)) {
      return pipe(
        Api.upload<Drive.State>({ sourceFilePath: src, docwsid: dstitem.docwsid, fname, zone: dstitem.zone }),
        SRTE.map(constVoid),
      )
    }
  }

  return Drive.errS(`invalid destination path: ${V.showGetByPathResult(dst)}`)
}

const uploadToFolder = (
  { src, dst, overwright, skipTrash }: {
    overwright:
      | boolean
      | AskingFunc
    dst: T.DetailsDocwsRoot | T.NonRootDetails
    src: string
    skipTrash: boolean
  },
): XXX<Drive.State, UploadActionDeps, void> => {
  const fname = Path.basename(src)
  const actualFile = pipe(
    findInParentFilename(dst, fname),
    O.filter(T.isFile),
  )

  if (isSome(actualFile)) {
    if (typeof overwright === 'boolean') {
      if (overwright) {
        return uploadOverwrighting({
          src,
          dstitem: actualFile.value,
          parent: dst,
          skipTrash,
        })
      }
      else {
        return SRTE.of(constVoid())
      }
    }
    else {
      return pipe(
        overwright({ message: `overwright ${fname}?` }),
        SRTE.fromTaskEither,
        SRTE.chain(overwright => uploadToFolder({ src, dst, overwright, skipTrash })),
      )
    }
  }

  return pipe(
    Api.upload<Drive.State>({ sourceFilePath: src, docwsid: dst.docwsid, zone: dst.zone }),
    SRTE.map(constVoid),
  )
}

const logging = (
  logfunc: IO<void>,
) =>
  <S, R, E, A>(effect: SRTE.StateReaderTaskEither<S, R, E, A>) =>
    pipe(
      logfunc,
      SRTE.fromIO,
      SRTE.chain(
        () => effect,
      ),
    )

const uploadOverwrighting = (
  { src, parent, dstitem, skipTrash }: {
    parent: T.DetailsDocwsRoot | T.NonRootDetails
    dstitem: T.DriveChildrenItemFile
    src: string
    skipTrash: boolean
  },
): XXX<Drive.State, UploadActionDeps, void> => {
  // const dstitem = V.target(dst)
  // const parent = NA.last(dst.path.details)

  return pipe(
    Api.upload<Drive.State>({ sourceFilePath: src, docwsid: parent.docwsid, zone: dstitem.zone }),
    logging(loggerIO.debug(`uploading`)),
    SRTE.bindTo('uploadResult'),
    SRTE.bindW('removeResult', () =>
      pipe(
        Api.moveItemsToTrash<Drive.State>({ items: [dstitem], trash: !skipTrash }),
        logging(loggerIO.debug(`moving previous file to trash`)),
      )),
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
        logging(loggerIO.debug(`renaming new file`)),
        SRTE.map(constVoid),
      )
    }),
  )
}
