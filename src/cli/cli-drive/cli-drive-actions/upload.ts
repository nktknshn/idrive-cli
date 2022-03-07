import * as A from 'fp-ts/Array'
import { constVoid, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { isSome } from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import prompts_ from 'prompts'
import { defaultApiEnv } from '../../../defaults'
import * as API from '../../../icloud/drive/api'
import { Use } from '../../../icloud/drive/api/type'
import * as V from '../../../icloud/drive/cache/cache-get-by-path-types'
import * as DF from '../../../icloud/drive/drive'
import * as H from '../../../icloud/drive/drive/validation'
import { findInParentFilename, parseName } from '../../../icloud/drive/helpers'
import {
  Details,
  DetailsDocwsRoot,
  DriveChildrenItemFile,
  fileName,
  isFile,
  isFolderLike,
  NonRootDetails,
} from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { NEA, XXX } from '../../../lib/types'
import { Path } from '../../../lib/util'
import { cliActionM2 } from '../../cli-action'
import { fstat } from './download/helpers'
import { normalizePath } from './helpers'
const prompts = TE.tryCatchK(prompts_, (e) => err(`error: ${e}`))

type AskingFunc = ((
  info: { parent: DetailsDocwsRoot | NonRootDetails; dstitem: DriveChildrenItemFile; src: string },
) => TE.TaskEither<Error, boolean>)

type Deps =
  & DF.DriveMEnv
  & Use<'renameItemsM'>
  & Use<'upload'>
  & Use<'moveItemsToTrashM'>

export const ask: AskingFunc = (info) =>
  pipe(
    prompts({
      type: 'confirm',
      name: 'value',
      message: `overwright ${fileName(info.dstitem)}`,
      choices: [
        { title: 'y', selected: false, value: 'y' },
        { value: 'n', title: 'n', selected: false },
      ],
    }, {
      onCancel: () => process.exit(1),
    }),
    TE.map(_ => {
      return _.value as boolean
    }),
  )

export const uploads = (
  { args, overwright }: {
    args: string[]
    overwright:
      | boolean
      | AskingFunc
  },
): XXX<DF.State, Deps, string> => {
  const dstpath = NA.last(args as NEA<string>)
  const srcpaths = NA.init(args as NEA<string>)

  return pipe(
    SRTE.ask<DF.State, Deps>(),
    SRTE.bindTo('api'),
    SRTE.bindW('root', DF.getRoot),
    SRTE.bindW('dst', ({ root }) => DF.getByPathFolder(root, normalizePath(dstpath))),
    SRTE.bindW('overwright', () => SRTE.of(overwright)),
    SRTE.chainW(({ api, dst, overwright }) =>
      pipe(
        srcpaths,
        A.map(src => uploadToFolder({ api, dst, src, overwright: ask })),
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
): XXX<DF.State, Deps, string> => {
  return pipe(
    SRTE.ask<DF.State, Deps>(),
    SRTE.bindTo('api'),
    SRTE.bindW('root', DF.getRoot),
    SRTE.bindW('dst', ({ root }) => DF.getByPathH(root, normalizePath(dstpath))),
    SRTE.bindW('src', () => SRTE.of(srcpath)),
    SRTE.bindW('srcstat', () => SRTE.fromTaskEither(fstat(srcpath))),
    SRTE.bindW('overwright', () => SRTE.of(overwright)),
    SRTE.chainW(handle),
    SRTE.map(() => `Success. ${Path.basename(srcpath)}`),
  )
}

const uploadToFolder = (
  { src, dst, overwright, api }: {
    overwright:
      | boolean
      | AskingFunc
    dst: DetailsDocwsRoot | NonRootDetails
    src: string
    api: Deps
  },
): SRTE.StateReaderTaskEither<DF.State, DF.DriveMEnv, Error, void> => {
  const actualFile = pipe(
    dst.items,
    A.filter(isFile),
    A.findFirst(item => fileName(item) == Path.basename(src)),
  )

  if (isSome(actualFile)) {
    if (typeof overwright === 'boolean') {
      if (overwright) {
        return uploadOverwrighting({ src, dstitem: actualFile.value, parent: dst, api })
      }
    }
    else {
      return pipe(
        overwright({ src, dstitem: actualFile.value, parent: dst }),
        SRTE.fromTaskEither,
        SRTE.chain(overwright => uploadToFolder({ src, dst, overwright, api })),
      )
    }
  }
  return pipe(
    api.upload<DF.State>({ sourceFilePath: src, docwsid: dst.docwsid, zone: dst.zone }),
    SRTE.map(constVoid),
  )
}

const handle = (
  { src, dst, overwright, api }: {
    dst: V.GetByPathResult<DetailsDocwsRoot>
    src: string
    overwright: boolean
    api: Deps
  },
): DF.DriveM<void> => {
  // if the target path is presented at icloud drive
  if (dst.valid) {
    const dstitem = V.target(dst)

    // if it's a folder
    if (isFolderLike(dstitem)) {
      return uploadToFolder({ src, dst: dstitem, api, overwright })
    }
    // if it's a file and the overwright flag set
    else if (overwright && V.isValidWithFile(dst)) {
      return uploadOverwrighting({ src, dstitem: dst.file.value, parent: NA.last(dst.path.details), api })
    }
    // otherwise we cancel uploading
    else {
      return DF.errS(`invalid destination path: ${V.asString(dst)} It's a file`)
    }
  }

  // if the path is valid only in its parent folder
  if (dst.path.rest.length == 1) {
    // upload and rename
    const dstitem = NA.last(dst.path.details)
    const fname = NA.head(dst.path.rest)

    if (isFolderLike(dstitem)) {
      return pipe(
        api.upload<DF.State>({ sourceFilePath: src, docwsid: dstitem.docwsid, fname, zone: dstitem.zone }),
        SRTE.map(constVoid),
      )
    }
  }

  return DF.errS(`invalid destination path: ${H.showMaybeValidPath(dst.path)}`)
}

const getDrivewsid = ({ zone, document_id, type }: { document_id: string; zone: string; type: string }) => {
  return `${type}::${zone}::${document_id}`
}

const uploadOverwrighting = (
  { src, parent, dstitem, api }: {
    api: Deps
    parent: DetailsDocwsRoot | NonRootDetails
    dstitem: DriveChildrenItemFile
    src: string
  },
) => {
  // const dstitem = V.target(dst)
  // const parent = NA.last(dst.path.details)

  return pipe(
    DF.Do,
    SRTE.bindW(
      'uploadResult',
      () => api.upload({ sourceFilePath: src, docwsid: parent.docwsid, zone: dstitem.zone }),
    ),
    SRTE.bindW('removeResult', () => {
      return api.moveItemsToTrashM({
        items: [dstitem],
        trash: true,
      })
    }),
    SRTE.chainW(({ uploadResult, removeResult }) => {
      const drivewsid = getDrivewsid(uploadResult)
      return pipe(
        api.renameItemsM<DF.State>({
          items: [{
            drivewsid,
            etag: uploadResult.etag,
            ...parseName(fileName(dstitem)),
          }],
        }),
        SRTE.map(constVoid),
      )
    }),
  )
}
