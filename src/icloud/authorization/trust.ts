import * as E from 'fp-ts/lib/Either'
import { apply, flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
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
import * as AR from '../drive/requests/reader'
import { ICloudSession, sessionLens } from '../session/session'
import { applyCookiesToSession, buildRequest } from '../session/session-http'
import { headers } from '../session/session-http-headers'
import { authorizationHeaders, getTrustToken } from './headers'
import { applyAuthorizationResponse } from './session'

export interface TrustResponse204 {
  trustToken: string
}

export const requestTrustDeviceM = <S extends AR.State>(): AR.ApiSessionRequest<TrustResponse204, S> => {
  logger.debug('requestTrustDeviceM')

  return pipe(
    AR.buildRequestC<S>(() => ({
      method: 'GET',
      url: 'https://idmsa.apple.com/appleauth/auth/2sv/trust',
      options: { addClientInfo: false, headers: [headers.default, authorizationHeaders] },
    })),
    AR.handleResponse(flow(
      AR.validateHttpResponse({ statuses: [200, 204] }),
      SRTE.bind('trustToken', ({ httpResponse }) =>
        pipe(
          getTrustToken(httpResponse),
          AR.fromOption(() => err('Missing trust token')),
        )),
      AR.applyToSession(({ httpResponse, trustToken }) =>
        flow(
          applyAuthorizationResponse(httpResponse),
          applyCookiesToSession(httpResponse),
          sessionLens.trustToken.set(O.some(trustToken)),
        )
      ),
    )),
  )
}
