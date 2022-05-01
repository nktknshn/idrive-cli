import { pipe } from 'fp-ts/lib/function'
import * as t from 'io-ts'
import * as AR from '../../../request/request'
import { DriveDetailsPartialWithHierarchy } from '../icloud-drive-types'
import { driveDetailsWithHierarchyPartial } from '../icloud-drive-types/types-io'
import { getRetrieveItemDetailsInFoldersHttpRequest } from './retrieveItemDetailsInFolders'

export const retrieveHierarchy = (
  { drivewsids }: { drivewsids: string[] },
): AR.AuthorizedRequest<DriveDetailsPartialWithHierarchy[]> =>
  pipe(
    getRetrieveItemDetailsInFoldersHttpRequest(
      drivewsids.map(drivewsid => ({ drivewsid, partialData: true, includeHierarchy: true })),
    ),
    AR.handleResponse(AR.basicJsonResponse(
      t.array(driveDetailsWithHierarchyPartial).decode,
    )),
  )
