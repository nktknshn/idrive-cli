import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import * as DF from '../../icloud/drive/fdrive'
import { isDetails, isNotRootDetails } from '../../icloud/drive/types'
import { err } from '../../lib/errors'
import { logger, logReturn, logReturnS } from '../../lib/logging'
import { Path } from '../../lib/util'
import { cliAction } from '../cli-actionF'
import { normalizePath } from './helpers'
import { showDetailsInfo, showFolderInfo } from './ls_action'

export const mkdir = ({
  sessionFile,
  cacheFile,
  path,
  noCache,
}: {
  path: string
  noCache: boolean
  sessionFile: string
  cacheFile: string
}): TE.TaskEither<Error, string> => {
  const parentPath = Path.dirname(path)
  const name = Path.basename(path)

  logger.debug(`mkdir(${name} in ${parentPath})`)

  return cliAction(
    {
      sessionFile,
      cacheFile,
      noCache,
      dontSaveCache: true,
    },
    ({ cache, api }) => {
      const nparentPath = normalizePath(Path.dirname(path))

      const res = pipe(
        DF.Do,
        SRTE.bind('parent', () => DF.lsdir(nparentPath)),
        SRTE.bind('result', ({ parent }) =>
          pipe(
            api.createFolders(parent.drivewsid, [name]),
            DF.fromTaskEither,
            DF.logS((resp) => `created: ${resp.folders.map((_) => _.drivewsid)}`),
          )),
        SRTE.chain(({ result, parent }) =>
          pipe(
            result.folders,
            A.matchLeft(
              () => SRTE.left(err(`createFolders returned empty result`)),
              (head) =>
                DF.retrieveItemDetailsInFoldersSaving([
                  head.drivewsid,
                  parent.drivewsid,
                ]),
            ),
          )
        ),
        SRTE.map(flow(A.lookup(1), O.flatten)),
        SRTE.map(
          O.fold(
            () => `missing created folder`,
            showDetailsInfo({
              fullPath: false,
              path: '',
            }),
          ),
        ),
        DF.saveCacheFirst(cacheFile),
      )

      return pipe(res(cache)(api), TE.map(fst))
    },
  )
}