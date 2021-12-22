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
    // (json: unknown): json is MoveItemToTrashResponse =>
    // isObjectWithOwnProperty(json, 'items')
  )

  const endpoint = trash ? 'moveItemsToTrash' : 'deleteItems'

  apiLogger.debug(`${endpoint}`)

  return pipe(
    session,
    buildRequest(
      'POST',
      `${accountData.webservices.drivews.url}/${endpoint}?dsid=${accountData.dsInfo.dsid}&appIdentifier=iclouddrive&reqIdentifier=9d4788f6-fc48-47e1-8d38-13c46d8d85db&clientBuildNumber=2116Project37&clientMasteringNumber=2116B28&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e`,
      {
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
