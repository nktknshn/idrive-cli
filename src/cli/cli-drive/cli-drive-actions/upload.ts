import { constVoid, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { isSome } from 'fp-ts/lib/Option'
import * as R from 'fp-ts/lib/Reader'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import * as V from '../../../icloud/drive/cache/GetByPathResultValid'
import * as H from '../../../icloud/drive/drivef/validation'
import * as DF from '../../../icloud/drive/fdrive'
import { parseName } from '../../../icloud/drive/helpers'
import { DetailsRoot, fileName, isDetails, isFile, isFolderLike, isFolderLikeItem } from '../../../icloud/drive/types'
import { err } from '../../../lib/errors'
import { cliAction } from '../../cli-actionF'
import { normalizePath } from './helpers'
import { showDetailsInfo, showFileInfo, showFolderInfo } from './ls_action'

type Env = {
  srcpath: string
  dstpath: string
}

// export const uploadReader = () => {
//   return pipe(
//     R.ask<Env>(),
//     SRTE.fromReader,
//     DF.from
//   )
// }

export const upload = (
  { sessionFile, cacheFile, srcpath, dstpath, noCache, overwright }: {
    srcpath: string
    dstpath: string
    noCache: boolean
    sessionFile: string
    cacheFile: string
    overwright: boolean
  },
) => {
  return cliAction(
    { sessionFile, cacheFile, noCache },
    ({ cache, api }) => {
      const res = pipe(
        DF.Do,
        SRTE.bind('src', () => DF.of(srcpath)),
        SRTE.bind('overwright', () => DF.of(overwright)),
        SRTE.bind('dst', () => DF.lsPartial(normalizePath(dstpath))),
        SRTE.chain(handle),
        DF.saveCacheFirst(cacheFile),
        DF.map(() => `Success.`),
      )

      return pipe(
        res(cache)({ api }),
        TE.map(fst),
      )
    },
  )
}

const getDrivewsid = ({ zone, document_id, type }: { document_id: string; zone: string; type: string }) => {
  return `${type}::${zone}::${document_id}`
}

const uploadOverwrighting = (
  { src, dst }: { dst: V.GetByPathResultValidWithFile<H.Hierarchy<DetailsRoot>>; src: string },
) => {
  const dstitem = V.target(dst)
  const parent = NA.last(dst.path.details)

  return pipe(
    DF.readEnv,
    SRTE.bind('uploadResult', ({ env }) => DF.fromTaskEither(env.api.upload(src, parent.docwsid))),
    SRTE.bind('removeResult', ({ env }) => {
      return DF.fromTaskEither(env.api.moveItemsToTrash([dstitem], true))
    }),
    DF.chain(({ env, uploadResult, removeResult }) => {
      const drivewsid = getDrivewsid(uploadResult)
      return pipe(
        env.api.renameItems([{
          drivewsid,
          etag: uploadResult.etag,
          ...parseName(fileName(dstitem)),
        }]),
        DF.fromTaskEither,
        DF.map(constVoid),
      )
    }),
  )
}

const handle = (
  { src, dst, overwright }: { dst: V.GetByPathResult; src: string; overwright: boolean },
): DF.DriveM<void> => {
  // upload to the directory
  if (dst.valid) {
    const dstitem = V.target(dst)

    if (isFolderLike(dstitem)) {
      return pipe(
        DF.readEnv,
        DF.chain(({ env }) =>
          pipe(
            env.api.upload(src, dstitem.docwsid),
            DF.fromTaskEither,
            DF.map(constVoid),
          )
        ),
      )
    }
    //
    else if (overwright && V.isValidWithFile(dst)) {
      return uploadOverwrighting({ src, dst })
    }

    return DF.errS(`invalid destination path: ${V.asString(dst)} It's a file`)
  }

  if (dst.path.rest.length == 1) {
    // upload and rename
    const dstitem = NA.last(dst.path.details)
    const fname = NA.head(dst.path.rest)
    if (isFolderLike(dstitem)) {
      return pipe(
        DF.readEnv,
        DF.chain(({ env }) =>
          pipe(
            env.api.upload(src, dstitem.docwsid, fname),
            DF.fromTaskEither,
            DF.map(constVoid),
          )
        ),
      )
    }
  }

  return DF.errS(`invalid destination path: ${H.showMaybeValidPath(dst.path)}`)
}
