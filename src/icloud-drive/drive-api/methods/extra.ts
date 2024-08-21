import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { AuthorizedState } from '../../../icloud-core/icloud-request'
import { err } from '../../../util/errors'
import { NEA } from '../../../util/types'
import * as T from '../../drive-types'
import { makeMissedFound } from '../../util/drive-helpers'
import { GetDep } from '../deps'
import { createFolders, download, retrieveItemDetailsInFolders } from './original'

export const retrieveItemDetailsInFoldersSeparated = <S extends AuthorizedState>(
  drivewsids: NEA<string>,
): SRTE.StateReaderTaskEither<
  S,
  GetDep<'retrieveItemDetailsInFolders', 'api'>,
  Error,
  { missed: string[]; found: (T.DetailsDocwsRoot | T.DetailsTrashRoot | T.DetailsFolder | T.DetailsAppLibrary)[] }
> =>
  pipe(
    retrieveItemDetailsInFolders<S>({ drivewsids }),
    SRTE.map(ds => makeMissedFound(drivewsids, ds)),
  )

export const retrieveItemDetailsInFolder = (
  drivewsid: string,
): SRTE.StateReaderTaskEither<
  AuthorizedState,
  GetDep<'retrieveItemDetailsInFolders'>,
  Error,
  T.Details | T.InvalidId
> =>
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
  // SRTE.map(O.fromNullable),
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
