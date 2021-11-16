import { flow } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { FetchClientEither } from '../../../lib/fetch-client'
import { applyCookies, ResponseWithSession } from '../../../lib/response-reducer'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { DriveDetailsPartialWithHierarchy } from '../types'
import { driveDetailsWithHierarchyPartial, hierarchy } from '../types-io'
import { applyToSession, decodeJson, filterStatus, withResponse } from './filterStatus'
import { retrieveItemDetailsInFoldersGeneric } from './retrieveItemDetailsInFolders'


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
          applyToSession(({ httpResponse }) => applyCookies(httpResponse)(session)),
        ),
      ),
  )

  return res
}
