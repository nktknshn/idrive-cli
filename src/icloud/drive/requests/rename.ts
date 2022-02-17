import * as t from 'io-ts'
import * as ARR from './api-rte'
import * as AR from './request'
import { childrenItem } from './types/types-io'

const renameResponse = t.type({ items: t.array(childrenItem) })

export interface RenameResponse extends t.TypeOf<typeof renameResponse> {}

export const renameItemsM = (
  { items }: {
    items: { drivewsid: string; etag: string; name: string; extension?: string }[]
  },
): AR.AuthorizedRequest<RenameResponse> =>
  AR.basicDriveJsonRequest(
    ({ state: { accountData } }) => ({
      method: 'POST',
      url: `${accountData.webservices.drivews.url}/renameItems?dsid=${accountData.dsInfo.dsid}`,
      options: {
        addClientInfo: true,
        data: { items },
      },
    }),
    renameResponse.decode,
  )

export const renameItemsARR = (
  { items }: {
    items: { drivewsid: string; etag: string; name: string; extension?: string }[]
  },
): ARR.DriveApiRequest<RenameResponse> => {
  return ARR.basicDriveJsonRequest(
    ({ accountData }) => ({
      method: 'POST',
      url: `${accountData.webservices.drivews.url}/renameItems?dsid=${accountData.dsInfo.dsid}`,
      options: {
        addClientInfo: true,
        data: { items },
      },
    }),
    renameResponse.decode,
  )
}
