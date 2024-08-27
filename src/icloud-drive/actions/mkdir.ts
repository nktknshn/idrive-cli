import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { logger } from '../../logging'
import { loggerIO } from '../../logging/loggerIO'
import { normalizePath, Path } from '../../util/path'
import { SRA } from '../../util/types'
import { DriveLookup } from '..'
import { DepApiMethod } from '../drive-api'
import { createFoldersStrict } from '../drive-api/extra'
import { showDetailsInfo } from './ls/ls-printing'

export type Deps =
  & DriveLookup.Deps
  & DepApiMethod<'createFoldersStrict'>

// TODO add -p option to create parent directories

export const mkdir = (
  { path }: { path: string },
): SRA<DriveLookup.State, Deps, string> => {
  const parentPath = Path.dirname(path)
  const name = Path.basename(path)

  logger.debug(`mkdir(${name} in ${parentPath})`)
  const nparentPath = normalizePath(Path.dirname(path))

  return pipe(
    DriveLookup.getCachedDocwsRoot(),
    SRTE.bindTo('root'),
    // Get parent folder details
    SRTE.bindW('parent', ({ root }) => DriveLookup.getByPathFolderStrict(root, nparentPath)),
    SRTE.bindW('result', ({ parent }) =>
      pipe(
        // try to create folder returning new folders shallow details
        createFoldersStrict<DriveLookup.State>({
          destinationDrivewsId: parent.drivewsid,
          names: [name],
        }),
        SRTE.chainFirstIOK((resp) => loggerIO.debug(`created: ${resp.map((_) => _.drivewsid)}`)),
      )),
    SRTE.chainW(({ result, parent }) =>
      // fetch full details for parent and for the new folder
      DriveLookup.retrieveItemDetailsInFoldersSavingStrict([
        parent.drivewsid,
        NA.head(result).drivewsid,
      ])
    ),
    SRTE.map(d =>
      // printint parent listing
      showDetailsInfo(d[0], '')({
        fullPath: false,
      })
    ),
  )
}
