import assert from 'assert'
import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { not } from 'fp-ts/lib/Predicate'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import * as DF from '../../../icloud/drive/fdrive'
import { isCloudDocsRootDetails, isNotRootDetails } from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { Path } from '../../../lib/util'
import { cliAction } from '../../cli-actionF'
import { normalizePath } from './helpers'
import { showDetailsInfo, showFolderInfo } from './ls_action'

export const rm = (
  { sessionFile, cacheFile, paths, noCache, trash }: {
    paths: string[]
    noCache: boolean
    sessionFile: string
    cacheFile: string
    trash: boolean
  },
) => {
  return cliAction({
    sessionFile,
    cacheFile,
    noCache,
    dontSaveCache: true,
  }, ({ cache, api }) => {
    assert(A.isNonEmpty(paths))

    const npaths = pipe(paths, NA.map(normalizePath))

    const res = pipe(
      DF.Do,
      SRTE.bind('items', () =>
        pipe(
          DF.chainRoot(root => DF.lss(root, npaths)),
          SRTE.filterOrElse(not(A.some(isCloudDocsRootDetails)), () => err(`you cannot remove root`)),
        )),
      SRTE.bind('result', ({ items }) =>
        pipe(
          api.moveItemsToTrash(items, trash),
          SRTE.fromTaskEither,
          SRTE.chain(
            resp => DF.removeByIds(resp.items.map(_ => _.drivewsid)),
          ),
        )),
      // SRTE.chain(() => DF.lsdir(parentPath)),
      DF.saveCacheFirst(cacheFile),
      DF.map(() => `Success.`),
      // SRTE.map(showDetailsInfo({
      //   fullPath: false,
      //   path: '',
      // })),
    )

    return pipe(res(cache)({ api }), TE.map(fst))
  })
}
