import * as A from 'fp-ts/lib/Array'
import { constant, flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as R from 'fp-ts/lib/Record'
import { HttpHeaders, HttpResponse } from './fetch-client'

export const headersToArray = (headers: HttpHeaders) => {
  const hs: (readonly [string, string | string[]])[] = []
  Object.entries(headers).forEach(([key, value]) => hs.push([key, value] as const))

  return hs
}

export const getHeader = (header: string) =>
  (httpResponse: HttpResponse): string[] =>
    pipe(
      httpResponse.headers,
      // TODO insure the case
      R.lookup(header.toLocaleLowerCase()),
      O.fold(() => [], v => typeof v === 'string' ? [v] : v),
    )

export const getSetCookie = getHeader('Set-Cookie')
