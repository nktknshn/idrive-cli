import assert from 'assert'
import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { not } from 'fp-ts/lib/Refinement'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { defaultApiEnv } from '../../../defaults'
import * as API from '../../../icloud/drive/api'
import { Use } from '../../../icloud/drive/api/type'
import * as DF from '../../../icloud/drive/drive'
import { isCloudDocsRootDetailsG, isTrashDetailsG } from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { cliActionM2 } from '../../cli-action'
import { normalizePath } from './helpers'
type Deps = DF.DriveMEnv & Use<'moveItemsToTrashM'>

export const rm = (
  { sessionFile, cacheFile, paths, noCache, trash }: {
    paths: string[]
    noCache: boolean
    sessionFile: string
    cacheFile: string
    trash: boolean
  },
) => {
  assert(A.isNonEmpty(paths))

  const npaths = pipe(paths, NA.map(normalizePath))

  return pipe(
    SRTE.ask<DF.DriveMState, Deps>(),
    SRTE.bindTo('api'),
    SRTE.bindW('items', () =>
      pipe(
        DF.chainRoot(root => DF.getByPaths(root, npaths)),
        DF.filterOrElse(not(A.some(isTrashDetailsG)), () => err(`you cannot remove root`)),
        DF.filterOrElse(not(A.some(isCloudDocsRootDetailsG)), () => err(`you cannot remove trash`)),
      )),
    SRTE.bindW('result', ({ items, api }) =>
      pipe(
        api.moveItemsToTrashM<DF.DriveMState>({ items, trash }),
        DF.chain(
          resp => DF.removeByIds(resp.items.map(_ => _.drivewsid)),
        ),
      )),
    // SRTE.chain(() => DF.lsdir(parentPath)),
    DF.map(() => `Success.`),
    // SRTE.map(showDetailsInfo({
    //   fullPath: false,
    //   path: '',
    // })),
  )
}
