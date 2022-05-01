import * as t from 'io-ts'
import { AuthorizedState } from '../../../request/request'
import * as AR from '../../../request/request'
import { childrenItem } from '../icloud-drive-types/types-io'

const moveItemResponse = t.type({
  items: t.array(t.union([
    childrenItem,
    t.type({ status: t.literal('CROSS_ZONE_MOVE_NOT_ALLOWED') }),
  ])),
})

// eslint-disable-next-line @typescript-eslint/no-empty-interface
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
