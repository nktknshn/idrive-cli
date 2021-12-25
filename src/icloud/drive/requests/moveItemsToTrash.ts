import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { FetchClientEither } from '../../../lib/http/fetch-client'
import { apiLogger } from '../../../lib/logging'
import { isObjectWithOwnProperty } from '../../../lib/util'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { buildRequest } from '../../session/session-http'
import { expectJson, ResponseWithSession } from './filterStatus'

export interface MoveItemToTrashResponse {
  items: { drivewsid: string }[]
}

export function moveItemsToTrash(
  client: FetchClientEither,
  { session, accountData }: ICloudSessionValidated,
  { items, trash = false }: {
    items: { drivewsid: string; etag: string }[]
    trash?: boolean
  },
): TE.TaskEither<Error, ResponseWithSession<MoveItemToTrashResponse>> {
  const applyHttpResponseToSession = expectJson(
    v => t.type({ items: t.array(t.type({ drivewsid: t.string })) }).decode(v) as t.Validation<MoveItemToTrashResponse>,
  )

  const endpoint = trash ? 'moveItemsToTrash' : 'deleteItems'

  apiLogger.debug(`${endpoint}`)

  return pipe(
    session,
    buildRequest(
      'POST',
      `${accountData.webservices.drivews.url}/${endpoint}?dsid=${accountData.dsInfo.dsid}`,
      {
        addClientInfo: true,
        data: {
          items: items.map((item) => ({
            drivewsid: item.drivewsid,
            clientId: item.drivewsid,
            etag: item.etag,
          })),
        },
      },
    ),
    client,
    applyHttpResponseToSession(session),
  )
}
