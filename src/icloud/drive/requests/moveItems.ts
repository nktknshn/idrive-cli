import * as t from 'io-ts'
import * as ARR from './api-rte'
import * as AR from './request'
import { childrenItem } from './types/types-io'

const moveItemToTrashResponse = t.type({ items: t.array(childrenItem) })

export interface MoveItemToTrashResponse extends t.TypeOf<typeof moveItemToTrashResponse> {}

export const moveItemsM = ({ items, destinationDrivewsId }: {
  destinationDrivewsId: string
  items: { drivewsid: string; etag: string }[]
}): AR.AuthorizedRequest<MoveItemToTrashResponse> =>
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
    moveItemToTrashResponse.decode,
  )

export const moveItemsARR = ({ items, destinationDrivewsId }: {
  destinationDrivewsId: string
  items: { drivewsid: string; etag: string }[]
}): ARR.DriveApiRequest<MoveItemToTrashResponse> =>
  ARR.basicDriveJsonRequest(
    ({ accountData }) => ({
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
    moveItemToTrashResponse.decode,
  )
