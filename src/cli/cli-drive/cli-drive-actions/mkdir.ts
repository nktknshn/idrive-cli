import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import * as DF from '../../../icloud/drive/fdrive'
import { isDetails, isNotRootDetails } from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { logger, logReturn, logReturnS } from '../../../lib/logging'
import { Path } from '../../../lib/util'
import { cliActionM } from '../../cli-action'
import { normalizePath } from './helpers'
import { showDetailsInfo, showFolderInfo } from './ls'

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

  return pipe(
    {
      sessionFile,
      cacheFile,
      noCache,
      dontSaveCache: true,
    },
    cliActionM(({ cache, api }) => {
      const nparentPath = normalizePath(Path.dirname(path))

      const res = pipe(
        DF.chainRoot(root =>
          pipe(
            DF.Do,
            SRTE.bind('parent', () => DF.lsdir(root, nparentPath)),
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
        ),
      )

      return pipe(res(cache)({ api }), TE.map(fst))
    }),
  )
}
