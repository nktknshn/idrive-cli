import { Method } from 'axios'
import * as A from 'fp-ts/lib/Array'
import { Lazy, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import { HttpRequest, HttpResponse } from '../../lib/fetch-client'
import { getAccountCountry, getAuthAttributes, getScnt, getSessionId, getSessionToken } from '../../lib/http-headers'
import { buildRecord } from '../../lib/util'
import { ICloudSession } from './session'
import { Header, headers as _headers } from './session-http-headers'

const fallback = <A>(
  onNone: Lazy<O.Option<A>>,
): ((v: O.Option<A>) => O.Option<A>) => O.fold(onNone, O.some)

export const buildRequest = (
  method: Method,
  url: string,
  {
    data = undefined,
    headers = [_headers.default],
  }: {
    data?: unknown
    headers?: ((session: ICloudSession) => Header[])[]
  } = {},
): ((session: ICloudSession) => HttpRequest) => {
  return (session) => ({
    url,
    method,
    headers: buildRecord(
      pipe(
        headers,
        A.map((f) => f(session)),
        A.flatten,
      ),
    ),
    data,
  })
}

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
