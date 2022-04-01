import { Lazy, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import { HttpResponse } from '../../util/http/fetch-client'
import { ICloudSession } from '../session/session'
import { getAccountCountry, getAuthAttributes, getScnt, getSessionId, getSessionToken } from './headers'

const fallback = <A>(
  onNone: Lazy<O.Option<A>>,
): ((v: O.Option<A>) => O.Option<A>) => O.fold(onNone, O.some)

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
