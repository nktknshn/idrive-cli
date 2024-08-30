import * as t from 'io-ts'
import * as AR from '../../icloud-core/icloud-request'
import { debugTimeSRTE } from '../../logging/debug-time'
import { childrenItem } from '../drive-types/types-io'

const moveItemResponse = t.type({
  items: t.array(t.union([
    childrenItem,
    t.type({ status: t.literal('CROSS_ZONE_MOVE_NOT_ALLOWED') }),
  ])),
})

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MoveItemsResponse extends t.TypeOf<typeof moveItemResponse> {}

export const moveItems = <S extends AR.AuthenticatedState>({ items, destinationDrivewsId }: {
  destinationDrivewsId: string
  items: { drivewsid: string; etag: string }[]
}): AR.ApiRequest<MoveItemsResponse, S, AR.RequestDeps> =>
  debugTimeSRTE('moveItems')(
    AR.basicJsonRequest(
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
    ),
  )
