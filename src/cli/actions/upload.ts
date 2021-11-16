import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as DF from '../../icloud/drive/drivef'
import { isFile, isFolderDetails, isFolderLike } from '../../icloud/drive/types'
import { err } from '../../lib/errors'
import { cliAction } from '../cli-actionF'
import { showFileInfo, showFolderInfo } from './ls'

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
      DF.ls(dstpath),
      SRTE.filterOrElse(isFolderLike, () => err(`${dstpath} is not a folder`)),
      SRTE.chain(item => SRTE.fromTaskEither(api.upload(srcpath, item.docwsid))),
      SRTE.chain(() => DF.ls(dstpath)),
      SRTE.filterOrElse(isFolderDetails, () => err(`imposiburu`)),
      SRTE.map(showFolderInfo()),
      // SRTE.chain(resp => DF.removeByIds(resp.items.map(_ => _.drivewsid))),
    )

    return res(cache)(api)
  })
}
