import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { FetchClientEither } from '../../../lib/http/fetch-client'
import { apiLogger } from '../../../lib/logging'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { buildRequest } from '../../session/session-http'
import { expectJson, ResponseWithSession } from './http'
import * as AR from './reader'
import { childrenItem } from './types/types-io'

const renameResponse = t.type({ items: t.array(childrenItem) })

export interface RenameResponse extends t.TypeOf<typeof renameResponse> {}

export function renameItems(
  client: FetchClientEither,
  { session, accountData }: ICloudSessionValidated,
  { items }: {
    items: {
      drivewsid: string
      etag: string
      name: string
      extension?: string
    }[]
  },
): TE.TaskEither<Error, ResponseWithSession<RenameResponse>> {
  apiLogger.debug('renameItems')

  return pipe(
    session,
    buildRequest(
      'POST',
      `${accountData.webservices.drivews.url}/renameItems?dsid=${accountData.dsInfo.dsid}`,
      {
        addClientInfo: true,
        data: { items },
      },
    ),
    client,
    expectJson(renameResponse.decode)(session),
  )
}

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
