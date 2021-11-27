import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { FetchClientEither } from '../../../lib/fetch-client'
import { apiLogger } from '../../../lib/logging'
import { ResponseWithSession } from '../../../lib/response-reducer'
import { isObjectWithOwnProperty } from '../../../lib/util'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { buildRequest } from '../../session/session-http'
import { DriveChildrenItem, DriveChildrenItemFile } from '../types'
import { childrenItem } from '../types-io'
import { expectJson } from './filterStatus'

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
      `${accountData.webservices.drivews.url}/moveItems?dsid=${accountData.dsInfo.dsid}&appIdentifier=iclouddrive&reqIdentifier=9d4788f6-fc48-47e1-8d38-13c46d8d85db&clientBuildNumber=2116Project37&clientMasteringNumber=2116B28&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e`,
      {
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
