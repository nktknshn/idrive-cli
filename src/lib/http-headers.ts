import * as A from 'fp-ts/lib/Array'
import { constant, flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as R from 'fp-ts/lib/Record'
import { HttpHeaders, HttpResponse } from './fetch-client'

export const headersToArray = (headers: HttpHeaders) => {
  const hs: (readonly [string, string | string[]])[] = []
  // .forEach((value, key) => hs.push([key, value] as const))
  Object.entries(headers).forEach(([key, value]) => hs.push([key, value] as const))

  return hs
}

// export const getHeader = (header: string) => (headers: HttpHeaders) => {
//   const headerLower = header.toLowerCase()
//   return pipe(
//     headersToArray(headers),
//     A.findFirst(([key, _]) => key.toLowerCase() == headerLower),
//     O.map(([_, value]) => (Array.isArray(value) ? value : [value])),
//     O.fold(
//       () => [],
//       (v) => v,
//     ),
//   )
// }

export const getHeader = (header: string) =>
  (httpResponse: HttpResponse): string[] =>
    pipe(
      httpResponse.headers,
      // TODO insure the case
      R.lookup(header.toLocaleLowerCase()),
      O.fold(() => [], v => typeof v === 'string' ? [v] : v),
    )

export const getSetCookie = getHeader('Set-Cookie')

// export const getHeaderOption = (header: string) => flow(getHeader(header), A.head)

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
// TODO
