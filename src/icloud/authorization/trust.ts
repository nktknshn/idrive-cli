import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import { err, UnexpectedResponse } from '../../lib/errors'
import { FetchClientEither, HttpResponse } from '../../lib/fetch-client'
import { getTrustToken } from '../../lib/http-headers'
import { logger } from '../../lib/logging'
import { applyCookies, createHttpResponseReducer1, ResponseWithSession } from '../../lib/response-reducer'
import { ICloudSession, SessionLens } from '../session/session'
import { applyAuthorizationResponse, buildRequest } from '../session/session-http'
import { headers } from '../session/session-http-headers'
import { authorizationHeaders } from './headers'

export interface TrustResponse204 {
  trustToken: string
}

export function getResponse(
  httpResponse: HttpResponse,
  json: E.Either<Error, unknown>,
): E.Either<Error, TrustResponse204> {
  if (httpResponse.status == 204) {
    return pipe(
      O.Do,
      O.bind('trustToken', () => getTrustToken(httpResponse)),
      E.fromOption(() => err('Missing trust token')),
    )
  }

  return E.left(UnexpectedResponse.create(httpResponse, json))
}

export function requestTrustDevice(
  client: FetchClientEither,
  session: ICloudSession,
): TE.TaskEither<Error, ResponseWithSession<unknown>> {
  logger.debug('requestTrustDevice')

  const applyHttpResponseToSession = createHttpResponseReducer1(
    getResponse,
    (session, httpResponse, response) =>
      pipe(
        session,
        applyCookies(httpResponse),
        applyAuthorizationResponse(httpResponse),
        SessionLens.trustToken.set(O.some(response.trustToken)),
      ),
  )

  return pipe(
    session,
    buildRequest(
      'GET',
      'https://idmsa.apple.com/appleauth/auth/2sv/trust',
      { headers: [headers.default, authorizationHeaders] },
    ),
    client,
    applyHttpResponseToSession(session),
  )
}
