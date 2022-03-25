import * as t from 'io-ts'
import { childrenItem } from '../types/types-io'
import { AuthorizedState } from './request'
import * as AR from './request'

const moveItemResponse = t.type({ items: t.array(childrenItem) })

export interface MoveItemsResponse extends t.TypeOf<typeof moveItemResponse> {}

export const moveItems = <S extends AuthorizedState>({ items, destinationDrivewsId }: {
  destinationDrivewsId: string
  items: { drivewsid: string; etag: string }[]
}): AR.AuthorizedRequest<MoveItemsResponse, S, AR.RequestEnv> =>
  AR.basicDriveJsonRequest(
    ({ state: { accountData } }) => ({
      method: 'POST',
      url: `${accountData.webservices.drivews.url}/moveItems?dsid=${accountData.dsInfo.dsid}`,
      options: {
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
    }),
    moveItemResponse.decode,
  )
