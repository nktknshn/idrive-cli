import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { FetchClientEither } from '../../../lib/fetch-client'
import { apiLogger } from '../../../lib/logging'
import { ResponseWithSession } from '../../../lib/response-reducer'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { buildRequest } from '../../session/session-http'
import { expectJson } from './filterStatus'
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
      `${accountData.webservices.drivews.url}/renameItems?dsid=${accountData.dsInfo.dsid}&appIdentifier=iclouddrive&reqIdentifier=9d4788f6-fc48-47e1-8d38-13c46d8d85db&clientBuildNumber=2116Project37&clientMasteringNumber=2116B28&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e`,
      {
        data: { items },
      },
    ),
    client,
    expectJson(renameResponse.decode)(session),
  )
}
