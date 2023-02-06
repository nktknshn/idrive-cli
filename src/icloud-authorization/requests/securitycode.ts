import { constant, flow, pipe } from 'fp-ts/lib/function'
import * as AR from '../../icloud-core/icloud-request/lib/request'
import { applyCookiesToSession } from '../../icloud-core/session/session-http'
import { headers } from '../../icloud-core/session/session-http-headers'
import { EmptyObject } from '../../util/types'
import { applyAuthorizationResponse } from './authorization-session'
import { authorizationHeaders } from './headers'

/** */
export const requestSecurityCode = <S extends AR.BaseState>(
  code: number,
): AR.ApiRequest<EmptyObject, S> => {
  return pipe(
    AR.buildRequestC<S>(() => ({
      method: 'POST',
      url: 'https://idmsa.apple.com/appleauth/auth/verify/trusteddevice/securitycode',
      options: {
        addClientInfo: false,
        data: { securityCode: { code } },
        headers: [headers.default, authorizationHeaders],
      },
    })),
    AR.handleResponse(flow(
      AR.validateHttpResponse({ validStatuses: [204] }),
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
