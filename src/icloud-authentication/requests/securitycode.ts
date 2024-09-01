import { constant, flow, pipe } from 'fp-ts/lib/function'
import * as AR from '../../icloud-core/icloud-request/lib/request'
import { applyCookiesToSession } from '../../icloud-core/session/session-http'
import { headers } from '../../icloud-core/session/session-http-headers'
import { apiLoggerIO } from '../../logging/loggerIO'
import { runLogging } from '../../util/srte-utils'
import { EmptyObject } from '../../util/types'
import { applyAuthenticationResponse } from './authentication-session'
import { authenticationHeaders } from './headers'

/** */
export const requestSecurityCode = <S extends AR.BaseState>(
  code: number,
): AR.ApiRequest<EmptyObject, S> => {
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
    AR.map(constant({})),
    runLogging(apiLoggerIO.debug('requestSecurityCode')),
  )
}
