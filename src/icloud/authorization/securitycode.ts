import { apply, flow, pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { FetchClientEither } from '../../lib/http/fetch-client'
import { logger } from '../../lib/logging'
import { EmptyObject } from '../../lib/types'
import { applyToSession2, filterStatus, ResponseWithSession, returnEmpty, withResponse } from '../drive/requests/http'
import { ICloudSession } from '../session/session'
import { applyCookiesToSession, buildRequest } from '../session/session-http'
import { headers } from '../session/session-http-headers'
import { authorizationHeaders } from './headers'
import { applyAuthorizationResponse } from './response'

export function requestSecurityCode(
  client: FetchClientEither,
  session: ICloudSession,
  { code }: { code: string },
): TE.TaskEither<Error, ResponseWithSession<EmptyObject>> {
  logger.debug(`requestSecurityCode: ${code}`)

  // const applyResponse = createHttpResponseReducer1(
  //   (httpResponse, json) =>
  //     httpResponse.status == 204
  //       ? E.right({})
  //       : E.left(UnexpectedResponse.create(httpResponse, json)),
  //   (session, httpResponse) =>
  //     pipe(
  //       session,
  //       applyAuthorizationResponse(httpResponse),
  //       applyCookies(httpResponse),
  //     ),
  // )

  const applyResponse = flow(
    withResponse,
    filterStatus(204),
    // decodeJson(v => t.type({ appsOrder: t.unknown }).decode(v) as t.Validation<EmptyObject>),
    applyToSession2(({ httpResponse }) =>
      flow(
        applyAuthorizationResponse(httpResponse),
        applyCookiesToSession(httpResponse),
      )
    ),
    returnEmpty,
  )

  return pipe(
    session,
    buildRequest(
      'POST',
      'https://idmsa.apple.com/appleauth/auth/verify/trusteddevice/securitycode',
      {
        addClientInfo: false,
        data: { securityCode: { code } },
        headers: [headers.default, authorizationHeaders],
      },
    ),
    client,
    TE.map(applyResponse),
    TE.chain(apply(session)),
  )
}
