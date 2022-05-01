import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { err } from '../../../../util/errors'
import { NEA } from '../../../../util/types'
import { AuthorizedState } from '../../../request/request'
import { getMissedFound } from '../../helpers'
import * as T from '../../icloud-drive-types'
import { DepDriveApi } from '../deps'
import { createFolders, download, retrieveItemDetailsInFolders } from './standard'

export const retrieveItemDetailsInFoldersSeparated = <S extends AuthorizedState>(
  drivewsids: NEA<string>,
): SRTE.StateReaderTaskEither<
  S,
  DepDriveApi<'retrieveItemDetailsInFolders', 'api'>,
  Error,
  { missed: string[]; found: (T.DetailsDocwsRoot | T.DetailsTrashRoot | T.DetailsFolder | T.DetailsAppLibrary)[] }
> =>
  pipe(
    retrieveItemDetailsInFolders<S>({ drivewsids }),
    SRTE.map(ds => getMissedFound(drivewsids, ds)),
  )

export const retrieveItemDetailsInFolder = (drivewsid: string) =>
  pipe(
    retrieveItemDetailsInFolders({ drivewsids: [drivewsid] }),
    SRTE.map(
      NA.head,
    ),
  )
/** .data_token?.url ?? _.package_token?.url */

export const getICloudItemUrl = flow(
  download,
  SRTE.map(
    _ => _.data_token?.url ?? _.package_token?.url,
  ),
)

export const createFoldersNEA = <S extends AuthorizedState>(args: {
  destinationDrivewsId: string
  names: NEA<string>
}) =>
  pipe(
    createFolders<S>(args),
    SRTE.map(_ => _.folders),
    SRTE.filterOrElse(A.isNonEmpty, () => err(`createFolders returned empty response`)),
  )

export const createFoldersStrict = flow(
  createFoldersNEA,
  SRTE.filterOrElse(
    (folders): folders is NEA<T.DriveChildrenItemFolder> => pipe(folders, A.every((folder) => folder.status === 'OK')),
    () => err(`createFolders couldn't create some folder. Existing directory?`),
  ),
)
