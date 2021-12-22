import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { FetchClientEither } from '../../../lib/http/fetch-client'
import { apiLogger } from '../../../lib/logging'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { applyCookies, buildRequest } from '../../session/session-http'
import { applyToSession, decodeJson, expectJson, filterStatus, ResponseWithSession, withResponse } from './filterStatus'
import { retrieveItemDetailsInFoldersGeneric } from './retrieveItemDetailsInFolders'
import { DetailsTrash, DriveChildrenItem } from './types/types'
import { detailsItem, detailsTrash } from './types/types-io'

export const scheme = t.tuple(
  [detailsTrash],
)

export interface RetrieveTrashDetailsResponse extends t.TypeOf<typeof scheme> {
}

export function retrieveTrashDetails(
  client: FetchClientEither,
  { session, accountData }: ICloudSessionValidated,
): TE.TaskEither<Error, ResponseWithSession<DetailsTrash>> {
  apiLogger.debug('retrieveTrashDetails')

  return retrieveItemDetailsInFoldersGeneric(
    client,
    { session, accountData },
    [{ 'drivewsid': 'TRASH_ROOT', 'partialData': false, 'includeHierarchy': true }],
    session => {
      return TE.chain(
        flow(
          withResponse,
          filterStatus(),
          decodeJson(flow(scheme.decode, E.map(_ => _[0]))),
          applyToSession(({ httpResponse }) => applyCookies(httpResponse)(session)),
        ),
      )
    },
  )
}

export function putBackItemsFromTrash(
  client: FetchClientEither,
  { session, accountData }: ICloudSessionValidated,
  items: [{ drivewsid: string; etag: string }],
): TE.TaskEither<Error, ResponseWithSession<{ items: DriveChildrenItem[] }>> {
  apiLogger.debug('putBackItemsFromTrash')

  return pipe(
    session,
    buildRequest(
      'POST',
      `${accountData.webservices.drivews.url}/putBackItemsFromTrash?dsid=${accountData.dsInfo.dsid}&appIdentifier=iclouddrive&reqIdentifier=9d4788f6-fc48-47e1-8d38-13c46d8d85db&clientBuildNumber=2116Project37&clientMasteringNumber=2116B28&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e`,
      {
        data: { items },
      },
    ),
    client,
    expectJson(t.type({ items: t.array(detailsItem) }).decode)(session),
  )
}
