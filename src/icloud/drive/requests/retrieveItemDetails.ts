import { apply, flow, pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { FetchClientEither, HttpResponse } from '../../../lib/http/fetch-client'
import { apiLogger } from '../../../lib/logging'
import { ICloudSession } from '../../session/session'
import { applyCookiesToSession, buildRequest } from '../../session/session-http'
import { ICloudSessionValidated } from './authorization/authorize'
import {
  applyCookiesFromResponse,
  applyToSession2,
  decodeJson,
  filterStatus,
  ResponseHandler,
  ResponseWithSession,
  returnDecoded,
  withResponse,
} from './http'
import { DriveItemDetails } from './types/types'
import { itemDetails } from './types/types-io'

function retrieveItemDetailsGeneric<R>(
  client: FetchClientEither,
  { accountData, session }: ICloudSessionValidated,
  props: { items: { drivewsid: string }[] },
  app: ResponseHandler<R>,
): TE.TaskEither<Error, ResponseWithSession<R>> {
  apiLogger.debug(`retrieveItemDetails: [${props.items.map(_ => _.drivewsid)}]`)

  return pipe(
    session,
    buildRequest(
      'POST',
      `${accountData.webservices.drivews.url}/retrieveItemDetails?dsid=${accountData.dsInfo.dsid}`,
      { addClientInfo: true, data: props },
    ),
    client,
    app(session),
  )
}

const scheme = t.type({
  items: t.array(
    itemDetails,
  ),
})

const handleResponse = flow(
  withResponse,
  filterStatus(),
  decodeJson(scheme.decode),
  applyCookiesFromResponse(),
  returnDecoded(),
)

const handle: ResponseHandler<{ items: DriveItemDetails[] }> = (session) =>
  flow(
    TE.map(handleResponse),
    TE.chain(apply(session)),
  )

export function retrieveItemDetails(
  client: FetchClientEither,
  { accountData, session }: ICloudSessionValidated,
  { drivewsids }: { drivewsids: string[] },
): TE.TaskEither<
  Error,
  ResponseWithSession<{ items: DriveItemDetails[] }>
> {
  return retrieveItemDetailsGeneric(
    client,
    { accountData, session },
    { items: drivewsids.map((drivewsid) => ({ drivewsid, includeHierarchy: true })) },
    handle,
  )
}
