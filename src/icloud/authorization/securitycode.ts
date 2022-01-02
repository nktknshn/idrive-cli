import { apply, constant, flow, pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { FetchClientEither } from '../../lib/http/fetch-client'
import { logger } from '../../lib/logging'
import { EmptyObject } from '../../lib/types'
import { applyToSession2, filterStatus, ResponseWithSession, returnEmpty, withResponse } from '../drive/requests/http'
import * as AR from '../drive/requests/reader'
import { ICloudSession } from '../session/session'
import { applyCookiesToSession, buildRequest } from '../session/session-http'
import { headers } from '../session/session-http-headers'
import { authorizationHeaders } from './headers'
import { applyAuthorizationResponse } from './session'

export function requestSecurityCode(
  client: FetchClientEither,
  session: ICloudSession,
  { code }: { code: string },
): TE.TaskEither<Error, ResponseWithSession<EmptyObject>> {
  logger.debug(`requestSecurityCode: ${code}`)

  const applyResponse = flow(
    withResponse,
    filterStatus(204),
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

export function requestSecurityCodeM(
  code: string,
): AR.AuthorizationApiRequest<{}> {
  return pipe(
    AR.buildRequestC(() => ({
      method: 'POST',
      url: 'https://idmsa.apple.com/appleauth/auth/verify/trusteddevice/securitycode',
      options: {
        addClientInfo: false,
        data: { securityCode: { code } },
        headers: [headers.default, authorizationHeaders],
      },
    })),
    AR.handleResponse(flow(
      AR.validateHttpResponse({ statuses: [204] }),
      AR.applyToSession(({ httpResponse }) =>
        flow(
          applyAuthorizationResponse(httpResponse),
          applyCookiesToSession(httpResponse),
        )
      ),
    )),
    AR.map(constant({})),
  )
}
