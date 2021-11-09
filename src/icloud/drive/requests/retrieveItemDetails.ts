import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { FetchClientEither } from '../../../lib/fetch-client'
import { expectJson, ResponseParser, ResponseWithSession } from '../../../lib/response-reducer'
import { isObjectWithOwnProperty } from '../../../lib/util'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { buildRequest } from '../../session/session-http'
import { DriveDetails, DriveDetailsFolder, DriveDetailsPartialWithHierarchy, DriveItemDetails } from '../types'

interface RetrieveOpts {
  drivewsids: string[]
  partialData: boolean
  includeHierarchy: boolean
}

function retrieveItemDetailsGeneric<R>(
  client: FetchClientEither,
  { accountData, session }: ICloudSessionValidated,
  props: {
    items: { drivewsid: string }[]
  },
  app: ResponseParser<R>,
): TE.TaskEither<Error, ResponseWithSession<R>> {
  return pipe(
    session,
    buildRequest(
      'POST',
      `${accountData.webservices.drivews.url}/retrieveItemDetails?dsid=${accountData.dsInfo.dsid}&appIdentifier=iclouddrive&reqIdentifier=9d4788f6-fc48-47e1-8d38-13c46d8d85db&clientBuildNumber=2116Project37&clientMasteringNumber=2116B28&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e`,
      {
        data: props,
      },
    ),
    client,
    app(session),
  )
}

const applyHttpResponseToSessionHierarchy = expectJson((
  json: unknown,
): json is { items: DriveItemDetails[] } => isObjectWithOwnProperty(json, 'items') && Array.isArray(json.items))

export function retrieveItemDetails(
  client: FetchClientEither,
  { accountData, session }: ICloudSessionValidated,
  { drivewsids }: { drivewsids: string[] },
): TE.TaskEither<Error, ResponseWithSession<{ items: DriveItemDetails[] }>> {
  return retrieveItemDetailsGeneric(
    client,
    { accountData, session },
    { items: drivewsids.map((drivewsid) => ({ drivewsid, includeHierarchy: true })) },
    applyHttpResponseToSessionHierarchy,
  )
}
