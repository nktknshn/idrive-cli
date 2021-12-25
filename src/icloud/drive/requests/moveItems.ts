import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { FetchClientEither } from '../../../lib/http/fetch-client'
import { apiLogger } from '../../../lib/logging'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { buildRequest } from '../../session/session-http'
import { expectJson, ResponseWithSession } from './filterStatus'
import { childrenItem } from './types/types-io'

const moveItemToTrashResponse = t.type({ items: t.array(childrenItem) })

export interface MoveItemToTrashResponse extends t.TypeOf<typeof moveItemToTrashResponse> {}

export function moveItems(
  client: FetchClientEither,
  { session, accountData }: ICloudSessionValidated,
  { items, destinationDrivewsId }: {
    destinationDrivewsId: string
    items: { drivewsid: string; etag: string }[]
  },
): TE.TaskEither<Error, ResponseWithSession<MoveItemToTrashResponse>> {
  apiLogger.debug('moveItems/moveItemsToTrash')

  return pipe(
    session,
    buildRequest(
      'POST',
      `${accountData.webservices.drivews.url}/moveItems?dsid=${accountData.dsInfo.dsid}`,
      {
        addClientInfo: true,
        data: {
          destinationDrivewsId,
          items: items.map((item) => ({
            drivewsid: item.drivewsid,
            clientId: item.drivewsid,
            etag: item.etag,
          })),
        },
      },
    ),
    client,
    expectJson(moveItemToTrashResponse.decode)(session),
  )
}
