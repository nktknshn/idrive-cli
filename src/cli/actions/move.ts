import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as V from '../../icloud/drive/cache/GetByPathResultValid'
import * as DF from '../../icloud/drive/fdrive'
import { isFolderLike } from '../../icloud/drive/types'
import { err } from '../../lib/errors'
import { cliAction } from '../cli-action'
import { Env } from '../types'
import { normalizePath } from './helpers'

export const move = ({
  sessionFile,
  cacheFile,
  srcpath,
  dstpath,
  noCache,
}: Env & {
  srcpath: string
  dstpath: string
}) => {
  return cliAction(
    { sessionFile, cacheFile, noCache },
    ({ cache, api }) => {
      const nsrc = normalizePath(srcpath)
      const ndst = normalizePath(dstpath)

      const res = pipe(
        // DF.readEnv,
        DF.Do,
        // src must be present
        SRTE.bind('srcitem', () => DF.ls(nsrc)),
        /*
          dst must be either
          - an existing folder. then we move srcitem into it
          - partially valid path with path equal to the path of src and a singleton rest. Then we rename the item
          - partially valid path with path *not* equal to the path of src and a singleton rest. Then we move the item into the path *and* rename the item
        */
        SRTE.bind('dstitem', () =>
          pipe(
            DF.lsPartial(ndst),
            DF.map(result => result.valid ? V.target(result) : result),
            SRTE.filterOrElse(isFolderLike, () => err(`dstpath is not a folder`)),
          )),
        SRTE.chain(({ srcitem, dstitem }) =>
          pipe(
            api.moveItems(dstitem.drivewsid, [{ drivewsid: srcitem.drivewsid, etag: srcitem.etag }]),
            SRTE.fromTaskEither,
            SRTE.chain(({ items }) => DF.putItems(items)),
          )
        ),
        // SRTE.chain(DF.saveCache(cacheFile)),
        // SRTE.chain(({ api, cache }) => pipe(
        //   api.moveItems()
        // )),
        // cache.getByPathE(srcpath),
        // SRTE.fromEither,
      )

      return res(cache)(api)
    },
  )
}
