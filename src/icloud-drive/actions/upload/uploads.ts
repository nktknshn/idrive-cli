import assert from 'assert'
import * as A from 'fp-ts/Array'
import { constVoid, pipe } from 'fp-ts/lib/function'
import { IO } from 'fp-ts/lib/IO'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { isSome } from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'

import { DepAskConfirmation, DepFs } from '../../../deps-types'
import { loggerIO } from '../../../logging/loggerIO'
import { normalizePath } from '../../../util/normalize-path'
import { Path } from '../../../util/path'
import { SRA } from '../../../util/types'
import { DriveLookup, Types } from '../..'
import { DepApiMethod, DriveApiMethods } from '../../drive-api'
import { findInParentFilename, getDrivewsid } from '../../util/drive-helpers'
import * as GetByPath from '../../util/get-by-path-types'
import { AskingFunc } from '../upload'

export type Deps =
  & DriveLookup.Deps
  & DepApiMethod<'renameItems'>
  & DepApiMethod<'moveItemsToTrash'>
  & DepApiMethod<'moveItems'>
  & DepApiMethod<'upload'>
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
): SRA<DriveLookup.State, Deps, string> => {
  assert(A.isNonEmpty(uploadargs))
  assert(uploadargs.length > 1)

  const dstpath = NA.last(uploadargs)
  const srcpaths = NA.init(uploadargs)

  return pipe(
    DriveLookup.getCachedDocwsRoot(),
    SRTE.bindTo('root'),
    SRTE.bind('dstDetails', ({ root }) => DriveLookup.getByPathFolderStrict(root, normalizePath(dstpath))),
    SRTE.bindW('deps', () => SRTE.ask<DriveLookup.State, Deps>()),
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
): SRA<DriveLookup.State, Deps, string> => {
  return pipe(
    DriveLookup.getCachedDocwsRoot(),
    SRTE.bindTo('root'),
    SRTE.bind('dst', ({ root }) => DriveLookup.getByPath(root, normalizePath(dstpath))),
    SRTE.bind('src', () => SRTE.of(srcpath)),
    SRTE.bind('overwright', () => SRTE.of(overwright)),
    SRTE.bind('skipTrash', () => SRTE.of(skipTrash)),
    SRTE.chain(handleSingleFileUpload),
    SRTE.map(() => `Success. ${Path.basename(srcpath)}`),
  )
}

const handleSingleFileUpload = (
  { src, dst, overwright, skipTrash }: {
    dst: GetByPath.Result<Types.DetailsDocwsRoot>
    src: string
    overwright: boolean
    skipTrash: boolean
  },
): SRA<DriveLookup.State, Deps, void> => {
  // if the target path already exists in icloud drive
  if (dst.valid) {
    const dstitem = GetByPath.pathTarget(dst)

    // if it's a folder
    if (Types.isFolderLike(dstitem)) {
      return uploadFileToFolder({ src, dstDetails: dstitem, overwright, skipTrash })
    }
    // if it's a file and the overwright flag set
    else if (overwright && GetByPath.isValidFile(dst)) {
      return uploadOverwrighting({ src, dstitem: dst.file, parent: NA.last(dst.details), skipTrash })
    }
    // otherwise we cancel uploading
    else {
      return DriveLookup.errString(`invalid destination path: ${GetByPath.validAsString(dst)} It's a file`)
    }
  }

  // if the path is valid only in its parent folder
  if (dst.rest.length == 1) {
    // upload and rename
    const dstitem = NA.last(dst.details)
    const fname = NA.head(dst.rest)

    if (Types.isFolderLike(dstitem)) {
      return pipe(
        DriveApiMethods.upload<DriveLookup.State>({
          sourceFilePath: src,
          docwsid: dstitem.docwsid,
          fname,
          zone: dstitem.zone,
        }),
        SRTE.map(constVoid),
      )
    }
  }

  return DriveLookup.errString(`invalid destination path: ${GetByPath.showGetByPathResult(dst)}`)
}

const uploadFileToFolder = (
  { src, dstDetails, overwright, skipTrash }: {
    overwright:
      | boolean
      | AskingFunc
    dstDetails: Types.DetailsDocwsRoot | Types.NonRootDetails
    src: string
    skipTrash: boolean
  },
): SRA<DriveLookup.State, Deps, void> => {
  const fname = Path.basename(src)

  const actualFile = pipe(
    findInParentFilename(dstDetails, fname),
    O.filter(Types.isFile),
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
    DriveApiMethods.upload<DriveLookup.State>({
      sourceFilePath: src,
      docwsid: dstDetails.docwsid,
      zone: dstDetails.zone,
    }),
    SRTE.map(constVoid),
  )
}

const uploadOverwrighting = (
  { src, parent, dstitem, skipTrash }: {
    parent: Types.DetailsDocwsRoot | Types.NonRootDetails
    dstitem: Types.DriveChildrenItemFile
    src: string
    skipTrash: boolean
  },
): SRA<DriveLookup.State, Deps, void> => {
  // const dstitem = V.target(dst)
  // const parent = NA.last(dst.path.details)
  return pipe(
    DriveApiMethods.upload<DriveLookup.State>({
      sourceFilePath: src,
      docwsid: parent.docwsid,
      zone: dstitem.zone,
    }),
    logging(loggerIO.debug(`uploading`)),
    SRTE.bindTo('uploadResult'),
    SRTE.bindW('removeResult', () =>
      pipe(
        DriveApiMethods.moveItemsToTrash<DriveLookup.State>({ items: [dstitem], trash: !skipTrash }),
        logging(loggerIO.debug(`moving previous file to trash`)),
      )),
    SRTE.chainW(({ uploadResult }) => {
      const drivewsid = getDrivewsid(uploadResult)
      return pipe(
        DriveApiMethods.renameItems<DriveLookup.State>({
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
