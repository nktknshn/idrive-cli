import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { DepDriveApi, DriveApi, DriveQuery } from '../../../icloud-drive/drive'
import { err } from '../../../util/errors'
import { loggerIO } from '../../../util/loggerIO'
import { logger } from '../../../util/logging'
import { normalizePath } from '../../../util/normalize-path'
import { Path } from '../../../util/path'
import { XXX } from '../../../util/types'
import { showDetailsInfo } from './ls/ls-printing'

type Deps =
  & DriveQuery.Deps
  & DepDriveApi<'createFoldersStrict'>

export const mkdir = (
  { path }: { path: string },
): XXX<DriveQuery.State, Deps, string> => {
  const parentPath = Path.dirname(path)
  const name = Path.basename(path)

  logger.debug(`mkdir(${name} in ${parentPath})`)
  const nparentPath = normalizePath(Path.dirname(path))

  return pipe(
    DriveQuery.getCachedDocwsRoot(),
    SRTE.bindTo('root'),
    SRTE.bindW('parent', ({ root }) => DriveQuery.getByPathFolderStrict(root, nparentPath)),
    SRTE.bindW('result', ({ parent }) =>
      pipe(
        DriveApi.createFoldersStrict<DriveQuery.State>({
          destinationDrivewsId: parent.drivewsid,
          names: [name],
        }),
        SRTE.chainFirstIOK((resp) => loggerIO.debug(`created: ${resp.map((_) => _.drivewsid)}`)),
      )),
    SRTE.chainW(({ result, parent }) =>
      pipe(
        result,
        A.matchLeft(
          () => SRTE.left(err(`createFolders returned empty result`)),
          (head) =>
            DriveQuery.retrieveItemDetailsInFoldersSavingStrict([
              head.drivewsid,
              parent.drivewsid,
            ]),
        ),
      )
    ),
    SRTE.map(NA.head),
    SRTE.map(d =>
      showDetailsInfo(d, '')({
        fullPath: false,
      })
    ),
  )
}
