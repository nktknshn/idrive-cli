import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { Readable } from 'stream'
import { err } from '../../../../util/errors'
import { expectResponse, FetchClientEither } from '../../../../util/http/fetch-client'
import * as AR from '../../../request'

export interface DownloadResponseBody {
  document_id: string
  owner_dsid: number
  data_token?: {
    url: string
    token: string
    signature: string
    wrapping_key: string
    reference_signature: string
  }
  package_token?: {
    url: string
    token: string
    signature: string
    wrapping_key: string
    reference_signature: string
  }
  double_etag: string
}

export function download<S extends AR.AuthorizedState>(
  { docwsid: documentId, zone }: {
    docwsid: string
    zone: string
  },
): AR.ApiRequest<DownloadResponseBody, S> {
  return AR.basicDriveJsonRequest(
    ({ state: { accountData } }) => ({
      method: 'GET',
      url:
        `${accountData.webservices.docws.url}/ws/${zone}/download/by_id?document_id=${documentId}&dsid=${accountData.dsInfo.dsid}`,
      options: { addClientInfo: false },
    }),
    v => t.type({ data_token: t.type({ url: t.string }) }).decode(v) as t.Validation<DownloadResponseBody>,
  )
}

export function downloadBatch<S extends AR.AuthorizedState>(
  { docwsids, zone }: { docwsids: string[]; zone: string },
): AR.ApiRequest<DownloadResponseBody[], S, AR.RequestEnv> {
  return AR.basicDriveJsonRequest(
    ({ state: { accountData } }) => ({
      method: 'POST',
      url: `${accountData.webservices.docws.url}/ws/${zone}/download/batch?dsid=${accountData.dsInfo.dsid}`,
      options: {
        addClientInfo: true,
        data: docwsids.map((document_id) => ({ document_id })),
      },
    }),
    v =>
      t.array(
        t.union(
          [
            t.type({ package_token: t.type({ url: t.string }) }),
            t.type({ data_token: t.type({ url: t.string }) }),
          ],
        ),
      ).decode(v) as t.Validation<DownloadResponseBody[]>,
  )
}

export const getUrlStream = ({ fetchClient }: { fetchClient: FetchClientEither }) =>
  (
    { url }: { url: string },
  ): TE.TaskEither<Error, Readable> => {
    return pipe(
      fetchClient({ method: 'GET', url, headers: {}, data: undefined, responseType: 'stream' }),
      expectResponse(
        _ => _.status == 200,
        _ => err(`responded ${_.status}`),
      ),
      TE.map(_ => _.data as Readable),
    )
  }
