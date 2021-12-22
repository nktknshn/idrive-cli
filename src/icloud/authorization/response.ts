import * as A from 'fp-ts/lib/Array'
import { flow, Lazy, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import { HttpResponse } from '../../lib/http/fetch-client'
import { getHeader } from '../../lib/http/http-headers'
import { ICloudSession } from '../session/session'

const fallback = <A>(
  onNone: Lazy<O.Option<A>>,
): ((v: O.Option<A>) => O.Option<A>) => O.fold(onNone, O.some)

export const [
  getScnt,
  getSessionId,
  getSessionToken,
  getAccountCountry,
  getAuthAttributes,
  getTwoSVTrustEligible,
  getAKAuthType,
  getOauthGrantCode,
  getTrustToken,
] = [
  'scnt',
  'X-Apple-ID-Session-Id',
  'X-Apple-Session-Token',
  'X-Apple-ID-Account-Country',
  'X-Apple-Auth-Attributes',
  'X-Apple-TwoSV-Trust-Eligible',
  'X-Apple-AK-Auth-Type',
  'X-Apple-OAuth-Grant-Code',
  'X-Apple-TwoSV-Trust-Token',
]
  .map(getHeader)
  .map(f => flow(f, A.head))

export function applyAuthorizationResponse(
  httpResponse: HttpResponse,
) {
  return (session: ICloudSession): ICloudSession => {
    const newSession = Object.assign({}, session)

    newSession.scnt = pipe(
      getScnt(httpResponse),
      fallback(() => newSession.scnt),
    )
    newSession.sessionId = fallback(() => newSession.sessionId)(
      getSessionId(httpResponse),
    )

    newSession.sessionToken = fallback(() => newSession.sessionToken)(
      getSessionToken(httpResponse),
    )

    newSession.accountCountry = fallback(() => newSession.accountCountry)(
      getAccountCountry(httpResponse),
    )
    newSession.authAttributes = fallback(() => newSession.authAttributes)(
      getAuthAttributes(httpResponse),
    )

    return newSession
  }
}
