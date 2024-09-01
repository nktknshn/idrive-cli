import { flow } from 'fp-ts/lib/function'
import * as t from 'io-ts'
import * as AR from '../../icloud-core/icloud-request'
import { debugTimeSRTE } from '../../logging/debug-time'
import { apiLoggerIO } from '../../logging/loggerIO'
import { runLogging } from '../../util/srte-utils'

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

export function download<S extends AR.AuthenticatedState>(
  { docwsid: documentId, zone }: {
    docwsid: string
    zone: string
  },
): AR.ApiRequest<DownloadResponseBody, S> {
  return flow(
    runLogging(apiLoggerIO.debug('download')),
    debugTimeSRTE('download'),
  )(
    AR.basicJsonRequest(
      ({ state: { accountData } }) => ({
        method: 'GET',
        url:
          `${accountData.webservices.docws.url}/ws/${zone}/download/by_id?document_id=${documentId}&dsid=${accountData.dsInfo.dsid}`,
        options: { addClientInfo: false },
      }),
      v => t.type({ data_token: t.type({ url: t.string }) }).decode(v) as t.Validation<DownloadResponseBody>,
    ),
  )
}

export function downloadBatch<S extends AR.AuthenticatedState>(
  { docwsids, zone }: { docwsids: string[]; zone: string },
): AR.ApiRequest<DownloadResponseBody[], S, AR.RequestDeps> {
  return flow(
    runLogging(apiLoggerIO.debug('downloadBatch')),
    debugTimeSRTE('downloadBatch'),
  )(
    AR.basicJsonRequest(
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
    ),
  )
}
