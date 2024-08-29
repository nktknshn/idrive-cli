import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { AuthenticatedState } from '../../icloud-core/icloud-request'
import { err } from '../../util/errors'
import { NEA } from '../../util/types'
import { CreateFoldersResponse } from '../drive-requests'
import * as T from '../drive-types'
import { makeMissedFound } from '../util/drive-helpers'
import { createFolders, download, retrieveItemDetailsInFolders } from './basic'
import { DepWrappedApi } from './method'

type Separated = {
  missed: string[]
  found: (T.DetailsDocwsRoot | T.DetailsTrashRoot | T.DetailsFolder | T.DetailsAppLibrary)[]
}

export const retrieveItemDetailsInFoldersSeparated = <S extends AuthenticatedState>(
  drivewsids: NEA<string>,
): SRTE.StateReaderTaskEither<
  S,
  DepWrappedApi<'retrieveItemDetailsInFolders', 'api'>,
  Error,
  Separated
> =>
  pipe(
    retrieveItemDetailsInFolders<S>({ drivewsids }),
    SRTE.map(ds => makeMissedFound(drivewsids, ds)),
  )

export const retrieveItemDetailsInFolder = (
  drivewsid: string,
): SRTE.StateReaderTaskEither<
  AuthenticatedState,
  DepWrappedApi<'retrieveItemDetailsInFolders'>,
  Error,
  T.Details | T.InvalidId
> =>
  pipe(
    retrieveItemDetailsInFolders({ drivewsids: [drivewsid] }),
    SRTE.map(NA.head),
  )

export const getDriveItemUrl = flow(
  download,
  SRTE.map(
    _ => _.data_token?.url ?? _.package_token?.url,
  ),
)

export const createFoldersNEA = <S extends AuthenticatedState>(args: {
  destinationDrivewsId: string
  names: NEA<string>
}): SRTE.StateReaderTaskEither<
  S,
  DepWrappedApi<'createFolders'>,
  Error,
  CreateFoldersResponse['folders']
> =>
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
