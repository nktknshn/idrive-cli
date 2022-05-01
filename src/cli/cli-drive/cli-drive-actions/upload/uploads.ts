import assert from 'assert'
import * as A from 'fp-ts/Array'
import { constVoid, pipe } from 'fp-ts/lib/function'
import { IO } from 'fp-ts/lib/IO'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { isSome } from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import { DepAskConfirmation, DepFs } from '../../../../icloud/deps'
import { DriveApi, DriveQuery } from '../../../../icloud/drive'
import { DepDriveApi } from '../../../../icloud/drive/drive-api/deps'
import { findInParentFilename, getDrivewsid } from '../../../../icloud/drive/drive-helpers'
import * as V from '../../../../icloud/drive/get-by-path-types'
import * as T from '../../../../icloud/drive/icloud-drive-types'
import { loggerIO } from '../../../../util/loggerIO'
import { normalizePath } from '../../../../util/normalize-path'
import { Path } from '../../../../util/path'
import { XXX } from '../../../../util/types'
import { AskingFunc } from '../upload'

export type Deps =
  & DriveQuery.Deps
  & DepDriveApi<'renameItems'>
  & DepDriveApi<'moveItemsToTrash'>
  & DepDriveApi<'moveItems'>
  & DriveApi.UploadMethodDeps
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
): XXX<DriveQuery.State, Deps, string> => {
  assert(A.isNonEmpty(uploadargs))
  assert(uploadargs.length > 1)

  const dstpath = NA.last(uploadargs)
  const srcpaths = NA.init(uploadargs)

  return pipe(
    DriveQuery.getCachedDocwsRoot(),
    SRTE.bindTo('root'),
    SRTE.bind('dstDetails', ({ root }) => DriveQuery.getByPathFolder(root, normalizePath(dstpath))),
    SRTE.bindW('deps', () => SRTE.ask<DriveQuery.State, Deps>()),
    SRTE.chain(({ dstDetails, deps }) =>
      pipe(
        srcpaths,
        A.map(src =>
          uploadFileToFolder({
            src,
            dstDetails,
            overwright: overwright ? true : deps.askConfirmation,
            skipTrash,
          })
        ),
        SRTE.sequenceArray,
      )
    ),
    SRTE.map(() => `Success. ${srcpaths}`),
  )
}

export const uploadSingleFile = (
  { srcpath, dstpath, overwright, skipTrash }: {
    srcpath: string
    dstpath: string
    overwright: boolean
    skipTrash: boolean
  },
): XXX<DriveQuery.State, Deps, string> => {
  return pipe(
    DriveQuery.getCachedDocwsRoot(),
    SRTE.bindTo('root'),
    SRTE.bind('dst', ({ root }) => DriveQuery.getByPath(root, normalizePath(dstpath))),
    SRTE.bind('src', () => SRTE.of(srcpath)),
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
): XXX<DriveQuery.State, Deps, void> => {
  // if the target path already exists at icloud drive
  if (dst.valid) {
    const dstitem = V.pathTarget(dst)

    // if it's a folder
    if (T.isFolderLike(dstitem)) {
      return uploadFileToFolder({ src, dstDetails: dstitem, overwright, skipTrash })
    }
    // if it's a file and the overwright flag set
    else if (overwright && V.isValidWithFile(dst)) {
      return uploadOverwrighting({ src, dstitem: dst.file.value, parent: NA.last(dst.details), skipTrash })
    }
    // otherwise we cancel uploading
    else {
      return DriveQuery.errS(`invalid destination path: ${V.validAsString(dst)} It's a file`)
    }
  }

  // if the path is valid only in its parent folder
  if (dst.rest.length == 1) {
    // upload and rename
    const dstitem = NA.last(dst.details)
    const fname = NA.head(dst.rest)

    if (T.isFolderLike(dstitem)) {
      return pipe(
        DriveApi.upload<DriveQuery.State>({ sourceFilePath: src, docwsid: dstitem.docwsid, fname, zone: dstitem.zone }),
        SRTE.map(constVoid),
      )
    }
  }

  return DriveQuery.errS(`invalid destination path: ${V.showGetByPathResult(dst)}`)
}

const uploadFileToFolder = (
  { src, dstDetails, overwright, skipTrash }: {
    overwright:
      | boolean
      | AskingFunc
    dstDetails: T.DetailsDocwsRoot | T.NonRootDetails
    src: string
    skipTrash: boolean
  },
): XXX<DriveQuery.State, Deps, void> => {
  const fname = Path.basename(src)

  const actualFile = pipe(
    findInParentFilename(dstDetails, fname),
    O.filter(T.isFile),
  )

  if (isSome(actualFile)) {
    if (typeof overwright === 'boolean') {
      if (overwright) {
        return uploadOverwrighting({
          src,
          dstitem: actualFile.value,
          parent: dstDetails,
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
        SRTE.chain(overwright => uploadFileToFolder({ src, dstDetails, overwright, skipTrash })),
      )
    }
  }

  return pipe(
    DriveApi.upload<DriveQuery.State>({
      sourceFilePath: src,
      docwsid: dstDetails.docwsid,
      zone: dstDetails.zone,
    }),
    SRTE.map(constVoid),
  )
}

const uploadOverwrighting = (
  { src, parent, dstitem, skipTrash }: {
    parent: T.DetailsDocwsRoot | T.NonRootDetails
    dstitem: T.DriveChildrenItemFile
    src: string
    skipTrash: boolean
  },
): XXX<DriveQuery.State, Deps, void> => {
  // const dstitem = V.target(dst)
  // const parent = NA.last(dst.path.details)
  return pipe(
    DriveApi.upload<DriveQuery.State>({ sourceFilePath: src, docwsid: parent.docwsid, zone: dstitem.zone }),
    logging(loggerIO.debug(`uploading`)),
    SRTE.bindTo('uploadResult'),
    SRTE.bindW('removeResult', () =>
      pipe(
        DriveApi.moveItemsToTrash<DriveQuery.State>({ items: [dstitem], trash: !skipTrash }),
        logging(loggerIO.debug(`moving previous file to trash`)),
      )),
    SRTE.chainW(({ uploadResult }) => {
      const drivewsid = getDrivewsid(uploadResult)
      return pipe(
        DriveApi.renameItems<DriveQuery.State>({
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
