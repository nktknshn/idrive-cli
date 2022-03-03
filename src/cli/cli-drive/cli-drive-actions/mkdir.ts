import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import { defaultApiEnv } from '../../../defaults'
import * as API from '../../../icloud/drive/api'
import { Use } from '../../../icloud/drive/api/type'
import * as DF from '../../../icloud/drive/drive'
import { err } from '../../../lib/errors'
import { logger } from '../../../lib/logging'
import { XXX } from '../../../lib/types'
import { Path } from '../../../lib/util'
import { cliActionM2 } from '../../cli-action'
import { normalizePath } from './helpers'
import { showDetailsInfo } from './ls/printing'

type Deps = DF.DriveMEnv & Use<'createFoldersM'>

export const mkdir = (
  { path }: { path: string },
): XXX<DF.State, Deps, string> => {
  const parentPath = Path.dirname(path)
  const name = Path.basename(path)

  logger.debug(`mkdir(${name} in ${parentPath})`)
  const nparentPath = normalizePath(Path.dirname(path))

  return pipe(
    SRTE.ask<DF.State, Deps>(),
    SRTE.bindTo('api'),
    SRTE.bindW('root', DF.getRoot),
    SRTE.bindW('parent', ({ root }) => DF.getByPathFolder(root, nparentPath)),
    SRTE.bindW('result', ({ parent, api }) =>
      pipe(
        api.createFoldersM<DF.State>({
          destinationDrivewsId: parent.drivewsid,
          names: [name],
        }),
        DF.logS((resp) => `created: ${resp.folders.map((_) => _.drivewsid)}`),
      )),
    SRTE.chainW(({ result, parent }) =>
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
  )
}
