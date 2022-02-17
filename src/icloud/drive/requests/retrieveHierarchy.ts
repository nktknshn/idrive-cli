import { flow } from 'fp-ts/lib/function'
import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { FetchClientEither } from '../../../lib/http/fetch-client'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { applyCookiesToSession } from '../../session/session-http'
import { applyToSession, decodeJson, filterStatus, ResponseWithSession, withResponse } from './http'
import * as AR from './request'
import {
  getRetrieveItemDetailsInFoldersHttpRequest,
  retrieveItemDetailsInFoldersGeneric,
} from './retrieveItemDetailsInFolders'
import { DriveDetailsPartialWithHierarchy } from './types/types'
import { driveDetailsWithHierarchyPartial, hierarchy } from './types/types-io'

export function retrieveHierarchy(
  client: FetchClientEither,
  { accountData, session }: ICloudSessionValidated,
  { drivewsids }: { drivewsids: string[] },
): TE.TaskEither<Error, ResponseWithSession<DriveDetailsPartialWithHierarchy[]>> {
  const res = retrieveItemDetailsInFoldersGeneric(
    client,
    { accountData, session },
    drivewsids.map(drivewsid => ({ drivewsid, partialData: true, includeHierarchy: true })),
    session =>
      TE.chain(
        flow(
          withResponse,
          filterStatus(),
          decodeJson(v => t.array(driveDetailsWithHierarchyPartial).decode(v)),
          applyToSession(({ httpResponse }) => applyCookiesToSession(httpResponse)(session)),
        ),
      ),
  )

  return res
}

export const retrieveHierarchyM = (
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
