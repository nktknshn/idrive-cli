import * as t from 'io-ts'
import { ICloudSessionValidated } from '../../authorization/authorize'
import * as ARR from './api-rte'
import * as AR from './request'
import { childrenItem } from './types/types-io'

const moveItemResponse = t.type({ items: t.array(childrenItem) })

export interface MoveItemsResponse extends t.TypeOf<typeof moveItemResponse> {}

export const moveItemsM = <S extends ICloudSessionValidated>({ items, destinationDrivewsId }: {
  destinationDrivewsId: string
  items: { drivewsid: string; etag: string }[]
}): AR.AuthorizedRequest<MoveItemsResponse, S> =>
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

export const moveItemsARR = ({ items, destinationDrivewsId }: {
  destinationDrivewsId: string
  items: { drivewsid: string; etag: string }[]
}): ARR.DriveApiRequest<MoveItemsResponse> =>
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
    moveItemResponse.decode,
  )
