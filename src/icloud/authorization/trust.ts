import * as E from 'fp-ts/lib/Either'
import { apply, flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import { err, UnexpectedResponse } from '../../lib/errors'
import { FetchClientEither, HttpResponse } from '../../lib/http/fetch-client'
import { logger } from '../../lib/logging'
import {
  applyToSession2,
  filterStatus,
  filterStatuses,
  ResponseWithSession,
  returnS,
  withResponse,
} from '../drive/requests/http'
import { ICloudSession, sessionLens } from '../session/session'
import { applyCookiesToSession, buildRequest } from '../session/session-http'
import { headers } from '../session/session-http-headers'
import { authorizationHeaders, getTrustToken } from './headers'
import { applyAuthorizationResponse } from './response'

export interface TrustResponse204 {
  trustToken: string
}

const applyHttpResponseToSession = flow(
  withResponse,
  filterStatus(200),
  TE.bind('trustToken', ({ httpResponse }) =>
    pipe(
      getTrustToken(httpResponse),
      TE.fromOption(() => err('Missing trust token')),
    )),
  applyToSession2(
    ({ httpResponse, trustToken }) =>
      flow(
        applyAuthorizationResponse(httpResponse),
        applyCookiesToSession(httpResponse),
        sessionLens.trustToken.set(O.some(trustToken)),
      ),
  ),
  returnS(({ trustToken }): TrustResponse204 => ({ trustToken })),
)

export function requestTrustDevice(
  client: FetchClientEither,
  session: ICloudSession,
): TE.TaskEither<Error, ResponseWithSession<unknown>> {
  logger.debug('requestTrustDevice')

  return pipe(
    session,
    buildRequest(
      'GET',
      'https://idmsa.apple.com/appleauth/auth/2sv/trust',
      { addClientInfo: false, headers: [headers.default, authorizationHeaders] },
    ),
    client,
    TE.map(applyHttpResponseToSession),
    TE.chain(apply(session)),
  )
}
