import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import * as DF from '../../icloud/drive/fdrive'
import { isFolderDetails, isNotRootDetails } from '../../icloud/drive/types'
import { err } from '../../lib/errors'
import { logger, logReturn, logReturnS } from '../../lib/logging'
import { Path } from '../../lib/util'
import { cliAction } from '../cli-actionF'
import { normalizePath } from './helpers'
import { showDetailsInfo, showFolderInfo } from './ls'

export const mkdir = (
  { sessionFile, cacheFile, path, noCache }: {
    path: string
    noCache: boolean
    sessionFile: string
    cacheFile: string
  },
) => {
  const parentPath = Path.dirname(path)
  const name = Path.basename(path)

  logger.debug(`mkdir(${name} in ${parentPath})`)

  return cliAction({
    sessionFile,
    cacheFile,
    noCache,
    dontSaveCache: true,
  }, ({ cache, api }) => {
    const npath = normalizePath(path)
    const nparentPath = normalizePath(parentPath)

    const res = pipe(
      DF.Do,
      SRTE.bind('parent', () =>
        pipe(
          DF.ls(nparentPath),
          SRTE.filterOrElse(isFolderDetails, () => err(`${parentPath} is not folder`)),
        )),
      SRTE.bind('result', ({ parent }) =>
        pipe(
          api.createFolders(parent.drivewsid, [name]),
          TE.map(
            logReturnS(
              resp => `created: ${resp.folders.map(_ => _.drivewsid)}`,
            ),
          ),
          DF.fromTaskEither,
        )),
      SRTE.chain(() =>
        DF.lss([
          npath,
          nparentPath,
        ])
      ),
      DF.saveCacheFirst(cacheFile),
      SRTE.map(ds => ds[1]),
      SRTE.filterOrElse(isFolderDetails, () => err(`imposiburu`)),
      SRTE.map(showDetailsInfo({
        fullPath: false,
        path: '',
      })),
    )

    return pipe(res(cache)(api), TE.map(fst))
  })
}
