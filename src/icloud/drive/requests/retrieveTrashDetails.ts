import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { FetchClientEither } from '../../../lib/http/fetch-client'
import { apiLogger } from '../../../lib/logging'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { applyCookiesToSession, buildRequest } from '../../session/session-http'
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
          applyToSession(({ httpResponse }) => applyCookiesToSession(httpResponse)(session)),
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

  const request = pipe(
    session,
    buildRequest(
      'POST',
      `${accountData.webservices.drivews.url}/putBackItemsFromTrash?dsid=${accountData.dsInfo.dsid}`,
      { addClientInfo: true, data: { items } },
    ),
  )

  return pipe(
    client(request),
    expectJson(t.type({ items: t.array(detailsItem) }).decode)(session),
  )
}
