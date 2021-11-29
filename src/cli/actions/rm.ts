import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import * as DF from '../../icloud/drive/fdrive'
import { isNotRootDetails } from '../../icloud/drive/types'
import { err } from '../../lib/errors'
import { Path } from '../../lib/util'
import { cliAction } from '../cli-actionF'
import { normalizePath } from './helpers'
import { showDetailsInfo, showFolderInfo } from './ls_action'

export const rm = (
  { sessionFile, cacheFile, path, noCache }: {
    path: string
    noCache: boolean
    sessionFile: string
    cacheFile: string
  },
) => {
  return cliAction({
    sessionFile,
    cacheFile,
    noCache,
    dontSaveCache: true,
  }, ({ cache, api }) => {
    const npath = normalizePath(path)
    const parentPath = normalizePath(Path.dirname(npath))

    const res = pipe(
      DF.Do,
      SRTE.bind('item', () =>
        pipe(
          DF.ls(npath),
          SRTE.filterOrElse(isNotRootDetails, () => err(`you cannot remove root`)),
        )),
      SRTE.bind('result', ({ item }) =>
        pipe(
          api.moveItemsToTrash([item]),
          SRTE.fromTaskEither,
          SRTE.chain(
            resp => DF.removeByIds(resp.items.map(_ => _.drivewsid)),
          ),
        )),
      SRTE.chain(() => DF.lsdir(parentPath)),
      DF.saveCacheFirst(cacheFile),
      SRTE.map(showDetailsInfo({
        fullPath: false,
        path: '',
      })),
    )

    return pipe(res(cache)(api), TE.map(fst))
  })
}
