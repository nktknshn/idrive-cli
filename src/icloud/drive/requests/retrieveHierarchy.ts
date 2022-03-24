import { pipe } from 'fp-ts/lib/function'
import * as t from 'io-ts'
import { DriveDetailsPartialWithHierarchy } from '../types'
import { driveDetailsWithHierarchyPartial } from '../types/types-io'
import * as AR from './request'
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
