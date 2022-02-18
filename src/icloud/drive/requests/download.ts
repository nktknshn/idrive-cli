import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { Readable } from 'stream'
import { err } from '../../../lib/errors'
import { expectResponse, FetchClientEither } from '../../../lib/http/fetch-client'
import { isObjectWithOwnProperty } from '../../../lib/util'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { applyCookiesToSession, buildRequest } from '../../session/session-http'
import * as ARR from './api-rte'
import { applyToSession, expectJson, ResponseWithSession } from './http'
import * as AR from './request'

type RetrieveOpts = {
  docwsid: string
  zone: string
}

interface ResponseBody {
  document_id: string
  owner_dsid: number
  data_token: {
    url: string
    token: string
    signature: string
    wrapping_key: string
    reference_signature: string
  }
  double_etag: string
}

export function downloadM(
  { docwsid: documentId, zone }: RetrieveOpts,
) {
  return AR.basicDriveJsonRequest(
    ({ state: { accountData } }) => ({
      method: 'GET',
      url:
        `${accountData.webservices.docws.url}/ws/${zone}/download/by_id?document_id=${documentId}&dsid=${accountData.dsInfo.dsid}`,
      options: { addClientInfo: false },
    }),
    v => t.type({ data_token: t.type({ url: t.string }) }).decode(v) as t.Validation<ResponseBody>,
  )
}

export function downloadARR(
  { docwsid: documentId, zone }: RetrieveOpts,
) {
  return ARR.basicDriveJsonRequest(
    ({ accountData }) => ({
      method: 'GET',
      url:
        `${accountData.webservices.docws.url}/ws/${zone}/download/by_id?document_id=${documentId}&dsid=${accountData.dsInfo.dsid}`,
      options: { addClientInfo: false },
    }),
    v => t.type({ data_token: t.type({ url: t.string }) }).decode(v) as t.Validation<ResponseBody>,
  )
}

export function getUrlStream(
  { client, url }: { client: FetchClientEither; url: string },
): TE.TaskEither<Error, Readable> {
  return pipe(
    client({ method: 'GET', url, headers: {}, data: undefined, responseType: 'stream' }),
    expectResponse(
      _ => _.status == 200,
      _ => err(`responded ${_.status}`),
    ),
    TE.map(_ => _.data as Readable),
  )
}

export function consumeStreamToString(readable: Readable): TE.TaskEither<Error, string> {
  return TE.fromTask<string, Error>(async () => {
    let data = ''
    for await (const chunk of readable) {
      data += chunk
    }
    return data
  })
}
