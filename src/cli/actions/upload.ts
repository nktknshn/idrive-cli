import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import * as DF from '../../icloud/drive/fdrive'
import { isFile, isFolderDetails, isFolderLike } from '../../icloud/drive/types'
import { err } from '../../lib/errors'
import { cliAction } from '../cli-actionF'
import { normalizePath } from './helpers'
import { showDetailsInfo, showFileInfo, showFolderInfo } from './ls_action'

export const upload = (
  { sessionFile, cacheFile, srcpath, dstpath, noCache }: {
    srcpath: string
    dstpath: string
    noCache: boolean
    sessionFile: string
    cacheFile: string
  },
) => {
  return cliAction({
    sessionFile,
    cacheFile,
    noCache,
  }, ({ cache, api }) => {
    const res = pipe(
      DF.ls(normalizePath(dstpath)),
      SRTE.filterOrElse(isFolderLike, () => err(`${dstpath} is not a folder`)),
      SRTE.chain(item => SRTE.fromTaskEither(api.upload(srcpath, item.docwsid))),
      SRTE.chain(() => DF.ls(normalizePath(dstpath))),
      SRTE.filterOrElse(isFolderDetails, () => err(`dstpath is mystically not a folder`)),
      SRTE.map(showDetailsInfo({ path: '', fullPath: false })),
      DF.saveCacheFirst(cacheFile),
    )

    return pipe(
      res(cache)(api),
      TE.map(fst),
    )
  })
}
