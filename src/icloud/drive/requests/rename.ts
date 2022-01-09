import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { FetchClientEither } from '../../../lib/http/fetch-client'
import { apiLogger } from '../../../lib/logging'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { buildRequest } from '../../session/session-http'
import * as ARR from './api-rte'
import { expectJson, ResponseWithSession } from './http'
import * as AR from './reader'
import { childrenItem } from './types/types-io'

const renameResponse = t.type({ items: t.array(childrenItem) })

export interface RenameResponse extends t.TypeOf<typeof renameResponse> {}

export const renameItemsM = (
  { items }: {
    items: { drivewsid: string; etag: string; name: string; extension?: string }[]
  },
): AR.DriveApiRequest<RenameResponse> =>
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
