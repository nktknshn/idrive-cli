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
  result,
  withResponse,
} from '../drive/requests/filterStatus'
import { ICloudSession, SessionLens } from '../session/session'
import { applyCookies, buildRequest } from '../session/session-http'
import { headers } from '../session/session-http-headers'
import { authorizationHeaders } from './headers'
import { applyAuthorizationResponse, getTrustToken } from './response'

export interface TrustResponse204 {
  trustToken: string
}

// export function getResponse(
//   httpResponse: HttpResponse,
//   json: E.Either<Error, unknown>,
// ): E.Either<Error, TrustResponse204> {
//   if (httpResponse.status == 204) {
//     return pipe(
//       O.Do,
//       O.bind('trustToken', () => getTrustToken(httpResponse)),
//       E.fromOption(() => err('Missing trust token')),
//     )
//   }

//   return E.left(UnexpectedResponse.create(httpResponse, json))
// }

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
        applyCookies(httpResponse),
        SessionLens.trustToken.set(O.some(trustToken)),
      ),
  ),
  result(({ trustToken }): TrustResponse204 => ({ trustToken })),
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
      { headers: [headers.default, authorizationHeaders] },
    ),
    client,
    TE.map(applyHttpResponseToSession),
    TE.chain(apply(session)),
  )
}
