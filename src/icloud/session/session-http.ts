import { Method } from 'axios'
import * as A from 'fp-ts/lib/Array'
import { flow, Lazy, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as R from 'fp-ts/lib/Reader'
import { applyCookieToCookies, getCookies } from '../../lib/http/cookie'
import { HttpRequest, HttpResponse } from '../../lib/http/fetch-client'
import { getHeader } from '../../lib/http/http-headers'
import { logger } from '../../lib/logging'
import { buildRecord } from '../../lib/util'
import { ICloudSession, SessionLens } from './session'
import { Header, headers as _headers } from './session-http-headers'

/** using session build a request to api */
export function buildRequest(
  method: Method,
  url: string,
  { data = undefined, headers = [_headers.default] }: {
    data?: unknown
    headers?: ((session: ICloudSession) => Header[])[]
  } = {},
): ((session: ICloudSession) => HttpRequest) {
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

export const applyCookies = (httpResponse: HttpResponse) =>
  (session: ICloudSession): ICloudSession => {
    const [errors, setCookies] = getCookies(httpResponse)

    if (errors.length > 0) {
      logger.error(
        errors,
      )
    }

    return pipe(
      session,
      SessionLens.cookies.set({
        cookies: applyCookieToCookies(
          session.cookies,
          setCookies,
        ),
      }),
    )
  }
