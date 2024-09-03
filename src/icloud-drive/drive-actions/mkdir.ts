import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { loggerIO } from '../../logging/loggerIO'
import { normalizePath, Path } from '../../util/path'
import { NEA, SRA } from '../../util/types'
import { DriveLookup, Types } from '..'
import { DepApiMethod } from '../drive-api'
import { createFoldersStrict } from '../drive-api/extra'

export type Deps =
  & DriveLookup.Deps
  & DepApiMethod<'createFoldersStrict'>

// TODO add -p option to create parent directories
// TODO create multiple folders in the same call (API supports it)

export const mkdir = (
  { path }: { path: string },
): SRA<DriveLookup.State, Deps, NEA<Types.DriveChildrenItemFolder>> => {
  const parentPath = Path.dirname(path)
  const name = Path.basename(path)

  const nparentPath = normalizePath(Path.dirname(path))

  return pipe(
    loggerIO.debug(`mkdir ${name} in ${parentPath}`),
    SRTE.fromIO,
    SRTE.chain(() => DriveLookup.getCachedDocwsRoot()),
    SRTE.bindTo('root'),
    // Get parent folder details
    SRTE.bindW('parent', ({ root }) => DriveLookup.getByPathFolderStrict(root, nparentPath)),
    SRTE.bindW('result', ({ parent }) =>
      pipe(
        // try to create folder returning shallow details for new folders
        createFoldersStrict<DriveLookup.State>({
          destinationDrivewsId: parent.drivewsid,
          names: [name],
        }),
        SRTE.chainFirstIOK((resp) => loggerIO.debug(`created: ${resp.map((_) => _.drivewsid)}`)),
      )),
    SRTE.chainFirstW(({ result, parent }) =>
      // fetch full details for the parent and for the new folder to save in cache
      DriveLookup.retrieveItemDetailsInFoldersCached([
        parent.drivewsid,
        NA.head(result).drivewsid,
      ])
    ),
    SRTE.chainFirstIOK((d) => loggerIO.debug(`created: ${d.result.map((_) => _.drivewsid)}`)),
    SRTE.map(d => d.result),
  )
}
