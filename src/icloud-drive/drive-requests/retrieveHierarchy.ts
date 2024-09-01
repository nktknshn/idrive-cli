import { pipe } from 'fp-ts/lib/function'
import * as t from 'io-ts'
import * as AR from '../../icloud-core/icloud-request'
import { logAPI } from '../../icloud-core/icloud-request/log'
import { DriveDetailsPartialWithHierarchy } from '../drive-types'
import { driveDetailsWithHierarchyPartial } from '../drive-types/types-io'
import { getRetrieveItemDetailsInFoldersHttpRequest } from './retrieveItemDetailsInFolders'

export const retrieveHierarchy = <S extends AR.AuthenticatedState>(
  { drivewsids }: { drivewsids: string[] },
): AR.ApiRequest<DriveDetailsPartialWithHierarchy[], S> =>
  pipe(
    getRetrieveItemDetailsInFoldersHttpRequest<S>(
      drivewsids.map(drivewsid => ({ drivewsid, partialData: true, includeHierarchy: true })),
    ),
    AR.handleResponse(AR.basicJsonResponse(
      t.array(driveDetailsWithHierarchyPartial).decode,
    )),
    logAPI('retrieveHierarchy'),
  )
