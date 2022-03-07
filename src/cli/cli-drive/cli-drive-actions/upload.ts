import { constVoid, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { defaultApiEnv } from '../../../defaults'
import * as API from '../../../icloud/drive/api'
import { Use } from '../../../icloud/drive/api/type'
import * as V from '../../../icloud/drive/cache/cache-get-by-path-types'
import * as DF from '../../../icloud/drive/drive'
import * as H from '../../../icloud/drive/drive/validation'
import { parseName } from '../../../icloud/drive/helpers'
import { DetailsDocwsRoot, fileName, isFolderLike } from '../../../icloud/drive/requests/types/types'
import { XXX } from '../../../lib/types'
import { Path } from '../../../lib/util'
import { cliActionM2 } from '../../cli-action'
import { normalizePath } from './helpers'

type Deps =
  & DF.DriveMEnv
  & Use<'renameItemsM'>
  & Use<'upload'>
  & Use<'moveItemsToTrashM'>

// export const uploadFolder = (
//   { sessionFile, cacheFile, srcpath, dstpath, noCache, overwright }: {
//     srcpath: string
//     dstpath: string
//     noCache: boolean
//     sessionFile: string
//     cacheFile: string
//     overwright: boolean
//   },
// ) => {
//   return pipe(
//     DF.Do,
//     SRTE.bindW('root', () => DF.chainRoot(root => DF.of(root))),
//     SRTE.bindW('dst', ({ root }) => DF.getByPathH(root, normalizePath(dstpath))),
//     SRTE.bindW('src', () => DF.of(srcpath)),
//     SRTE.bindW('overwright', () => DF.of(overwright)),
//     SRTE.chainW(handle),
//     DF.map(() => `Success. ${Path.basename(srcpath)}`),
//   )
// }

export const upload = (
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
    SRTE.bindW('overwright', () => SRTE.of(overwright)),
    SRTE.chainW(handle),
    SRTE.map(() => `Success. ${Path.basename(srcpath)}`),
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
      return pipe(
        api.upload<DF.State>({ sourceFilePath: src, docwsid: dstitem.docwsid, zone: dstitem.zone }),
        SRTE.map(constVoid),
      )
    }
    // if it's a file and the overwright flag set
    else if (overwright && V.isValidWithFile(dst)) {
      return uploadOverwrighting({ src, dst, api })
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
  { src, dst, api }: {
    api: Deps
    dst: V.PathValidWithFile<H.Hierarchy<DetailsDocwsRoot>>
    src: string
  },
) => {
  const dstitem = V.target(dst)
  const parent = NA.last(dst.path.details)

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
