import { Method } from 'axios'
import * as A from 'fp-ts/lib/Array'
import { flow, Lazy, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as R from 'fp-ts/lib/Reader'
import { cli } from 'winston/lib/winston/config'
import { ClientInfo, defaultClientInfo } from '../../config'
import { applyCookieToCookies, getCookies } from '../../lib/http/cookie'
import { HttpRequest, HttpResponse } from '../../lib/http/fetch-client'
import { getHeader } from '../../lib/http/http-headers'
import { logger } from '../../lib/logging'
import { buildRecord } from '../../lib/util'
import { ICloudSession, sessionLens } from './session'
import { Header, headers as _headers } from './session-http-headers'

export function buildRequest(
  method: Method,
  url: string,
  { data = undefined, headers = [_headers.default], clientInfo = defaultClientInfo, addClientInfo }: {
    data?: unknown
    headers?: ((session: ICloudSession) => Header[])[]
    addClientInfo: boolean
    clientInfo?: ClientInfo
  },
): R.Reader<ICloudSession, HttpRequest> {
  if (addClientInfo) {
    const clientInfoString =
      `appIdentifier=${clientInfo.appIdentifier}&reqIdentifier=${clientInfo.reqIdentifier}&clientBuildNumber=${clientInfo.clientBuildNumber}&clientMasteringNumber=${clientInfo.clientMasteringNumber}&clientId=${clientInfo.clientId}`

    if (url.includes('?')) {
      url = `${url}&${clientInfoString}`
    }
    else {
      url = `${url}?${clientInfoString}`
    }
  }

  return (session: ICloudSession) => ({
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

export type HttpRequestConfig = {
  method: Method
  url: string
  options: {
    data?: unknown
    headers?: ((session: ICloudSession) => Header[])[]
    /** add appIdentifier etc to the url */
    addClientInfo: boolean
    clientInfo?: ClientInfo
  }
}

export function apiHttpRequest(
  method: Method,
  url: string,
  { data = undefined, headers = [_headers.default], clientInfo = defaultClientInfo, addClientInfo }: {
    data?: unknown
    headers?: ((session: ICloudSession) => Header[])[]
    /** add appIdentifier etc to the url */
    addClientInfo: boolean
    clientInfo?: ClientInfo
  },
): R.Reader<{ session: ICloudSession }, HttpRequest> {
  return pipe(
    R.asks(({ session }) => buildRequest(method, url, { data, headers, clientInfo, addClientInfo })(session)),
  )
}

export function buildRequestR2(
  method: Method,
  url: string,
  { data = undefined, headers = [_headers.default], clientInfo = defaultClientInfo, addClientInfo }: {
    data?: unknown
    headers?: ((session: ICloudSession) => Header[])[]
    /** add appIdentifier etc to the url */
    addClientInfo: boolean
    clientInfo?: ClientInfo
  },
): R.Reader<{ session: ICloudSession }, HttpRequest> {
  return pipe(
    R.asks(({ session }) => buildRequest(method, url, { data, headers, clientInfo, addClientInfo })(session)),
  )
}

export const applyCookiesToSession = (httpResponse: HttpResponse) =>
  (session: ICloudSession): ICloudSession => {
    const [errors, setCookies] = getCookies(httpResponse)

    if (errors.length > 0) {
      logger.error(
        errors,
      )
    }

    return pipe(
      session,
      sessionLens.cookies.set({
        cookies: applyCookieToCookies(
          session.cookies,
          setCookies,
        ),
      }),
    )
  }
