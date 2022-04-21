import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { Api, Drive } from '../../../icloud/drive'
import { DepApi } from '../../../icloud/drive/deps'
import { err } from '../../../util/errors'
import { loggerIO } from '../../../util/loggerIO'
import { logger } from '../../../util/logging'
import { normalizePath } from '../../../util/normalize-path'
import { Path } from '../../../util/path'
import { XXX } from '../../../util/types'
import { showDetailsInfo } from './ls/ls-printing'

type Deps = Drive.Deps & DepApi<'createFolders'>

export const mkdir = (
  { path }: { path: string },
): XXX<Drive.State, Deps, string> => {
  const parentPath = Path.dirname(path)
  const name = Path.basename(path)

  logger.debug(`mkdir(${name} in ${parentPath})`)
  const nparentPath = normalizePath(Path.dirname(path))

  return pipe(
    Drive.getDocwsRoot(),
    SRTE.bindTo('root'),
    SRTE.bindW('parent', ({ root }) => Drive.getByPathFolder(root, nparentPath)),
    SRTE.bindW('result', ({ parent }) =>
      pipe(
        Api.createFoldersFailing<Drive.State>({
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
            Drive.retrieveItemDetailsInFoldersSavingStrict([
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
