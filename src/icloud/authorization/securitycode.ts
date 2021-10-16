import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { UnexpectedResponse } from '../../lib/errors'
import { FetchClientEither } from '../../lib/fetch-client'
import { logger } from '../../lib/logging'
import { applyCookies, createHttpResponseReducer1, ResponseWithSession } from '../../lib/response-reducer'
import { EmptyObject } from '../../lib/types'
import { ICloudSession } from '../session/session'
import { applyAuthorizationResponse, buildRequest } from '../session/session-http'
import { headers } from '../session/session-http-headers'
import { authorizationHeaders } from './headers'

export function requestSecurityCode(
  client: FetchClientEither,
  session: ICloudSession,
  { code }: { code: string },
): TE.TaskEither<Error, ResponseWithSession<EmptyObject>> {
  logger.debug(`requestSecurityCode: ${code}`)

  const applyResponse = createHttpResponseReducer1(
    (httpResponse, json) =>
      httpResponse.status == 204
        ? E.right({})
        : E.left(UnexpectedResponse.create(httpResponse, json)),
    (session, httpResponse) =>
      pipe(
        session,
        applyAuthorizationResponse(httpResponse),
        applyCookies(httpResponse),
      ),
  )

  return pipe(
    session,
    buildRequest(
      'POST',
      'https://idmsa.apple.com/appleauth/auth/verify/trusteddevice/securitycode',
      {
        data: { securityCode: { code } },
        headers: [headers.default, authorizationHeaders],
      },
    ),
    client,
    applyResponse(session),
  )
}
