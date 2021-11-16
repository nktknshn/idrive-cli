import * as A from 'fp-ts/lib/Array'
import { constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as J from 'fp-ts/lib/Json'
import * as O from 'fp-ts/lib/Option'
import { snd } from 'fp-ts/lib/ReadonlyTuple'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import { Cache, isFolderLikeCacheEntity } from '../../icloud/drive/cache/cachef'
import { DriveApi } from '../../icloud/drive/drive-api'
import * as DF from '../../icloud/drive/drivef'
import { hierarchyToPath } from '../../icloud/drive/helpers'
import { isFolderLike } from '../../icloud/drive/types'
import { err } from '../../lib/errors'
import { logger } from '../../lib/logging'
import { EmptyObject } from '../../lib/types'
import { cliAction } from '../cli-action'
import { Env } from '../types'
import { compareDetails, compareItemWithHierarchy, getCachedDetailsPartialWithHierarchyById } from './helpers'

type Output = string
type ErrorOutput = Error

type Change = 'ParentChanged'

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
    { sessionFile, cacheFile, noCache, dontSaveCache: true },
    ({ cache, api }) => {
      const res = pipe(
        // DF.readEnv,
        DF.Do,
        SRTE.bind('srcitem', () => DF.ls(srcpath)),
        SRTE.bind('dstitem', () =>
          pipe(
            DF.ls(dstpath),
            SRTE.filterOrElse(isFolderLike, () => err(`dstpath is not a folder`)),
          )),
        SRTE.chain(({ srcitem, dstitem }) =>
          pipe(
            api.moveItems(dstitem.drivewsid, [{ drivewsid: srcitem.drivewsid, etag: srcitem.etag }]),
            SRTE.fromTaskEither,
            SRTE.chain(({ items }) => DF.putItems(items)),
          )
        ),
        SRTE.chain(DF.saveCache(cacheFile)),
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
