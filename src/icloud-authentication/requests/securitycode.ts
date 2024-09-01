import { constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as AR from '../../icloud-core/icloud-request'

import { logAPI } from '../../icloud-core/icloud-request/log'
import { applyCookiesToSession } from '../../icloud-core/session/session-http'
import { headers } from '../../icloud-core/session/session-http-headers'
import { applyAuthenticationResponse } from './authentication-session'
import { authenticationHeaders } from './headers'

export const requestSecurityCode = <S extends AR.BaseState>(
  code: number,
): AR.ApiRequest<void, S> => {
  return pipe(
    AR.buildRequest<S>(() => ({
      method: 'POST',
      url: 'https://idmsa.apple.com/appleauth/auth/verify/trusteddevice/securitycode',
      options: {
        addClientInfo: false,
        data: { securityCode: { code } },
        headers: [headers.default, authenticationHeaders],
      },
    })),
    AR.handleResponse(flow(
      AR.validateHttpResponse({ validStatuses: [204] }),
      AR.applyToSession(({ httpResponse }) =>
        flow(
          applyAuthenticationResponse(httpResponse),
          applyCookiesToSession(httpResponse),
        )
      ),
    )),
    AR.map(constVoid),
    logAPI('requestSecurityCode'),
  )
}
