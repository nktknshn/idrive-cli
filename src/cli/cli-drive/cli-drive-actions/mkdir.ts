import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import { defaultApiEnv } from '../../../defaults'
import * as API from '../../../icloud/drive/api'
import * as DF from '../../../icloud/drive/drive'
import { err } from '../../../lib/errors'
import { logger } from '../../../lib/logging'
import { Path } from '../../../lib/util'
import { cliActionM2 } from '../../cli-action'
import { normalizePath } from './helpers'
import { showDetailsInfo } from './ls'

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
      ...defaultApiEnv,
    },
    cliActionM2(() => {
      const nparentPath = normalizePath(Path.dirname(path))

      const res = pipe(
        DF.Do,
        SRTE.bind('root', () => DF.chainRoot(DF.of)),
        SRTE.bind('parent', ({ root }) => DF.lsdir(root, nparentPath)),
        SRTE.bind('result', ({ parent }) =>
          pipe(
            API.createFolders({
              destinationDrivewsId: parent.drivewsid,
              names: [name],
            }),
            DF.fromApiRequest,
            DF.logS((resp) => `created: ${resp.folders.map((_) => _.drivewsid)}`),
          )),
        DF.chain(({ result, parent }) =>
          pipe(
            result.folders,
            A.matchLeft(
              () => DF.left(err(`createFolders returned empty result`)),
              (head) =>
                DF.retrieveItemDetailsInFoldersSaving([
                  head.drivewsid,
                  parent.drivewsid,
                ]),
            ),
          )
        ),
        DF.map(flow(A.lookup(1), O.flatten)),
        DF.map(
          O.fold(
            () => `missing created folder`,
            showDetailsInfo({
              fullPath: false,
              path: '',
            }),
          ),
        ),
      )

      return res
    }),
  )
}
