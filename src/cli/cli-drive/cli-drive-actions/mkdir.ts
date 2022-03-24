import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { Api, DepApi, Drive } from '../../../icloud/drive'
import { err } from '../../../lib/errors'
import { logger } from '../../../lib/logging'
import { XXX } from '../../../lib/types'
import { Path } from '../../../lib/util'
import { normalizePath } from './helpers'
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
        Drive.logS((resp) => `created: ${resp.map((_) => _.drivewsid)}`),
      )),
    SRTE.chainW(({ result, parent }) =>
      pipe(
        result,
        A.matchLeft(
          () => SRTE.left(err(`createFolders returned empty result`)),
          (head) =>
            Drive.retrieveItemDetailsInFoldersSaving([
              head.drivewsid,
              parent.drivewsid,
            ]),
        ),
      )
    ),
    SRTE.map(flow(NA.head)),
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
