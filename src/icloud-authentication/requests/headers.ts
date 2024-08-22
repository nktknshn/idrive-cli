import * as A from 'fp-ts/lib/Array'
import { flow } from 'fp-ts/lib/function'
import { isSome } from 'fp-ts/lib/Option'
import { Header } from '../../icloud-core/session/session-http-headers'
import { ICloudSession } from '../../icloud-core/session/session-type'
import { getHeader } from '../../util/http/http-headers'

export const authenticationHeaders = (
  session: ICloudSession,
): Header[] => {
  const headers: Header[] = [
    ['X-Apple-Domain-Id', '3'],
    [
      'X-Apple-I-FD-Client-Info',
      '{"U":"Mozilla/5.0 (X11; Linux x86_64; rv:90.0) Gecko/20100101 Firefox/90.0","L":"en-US","Z":"GMT+03:00","V":"1.1","F":"7ta44j1e3NlY5BNlY5BSs5uQ084akJ1ic3WuWJ4MPuQVD_DJhCizgzH_y3EjNklYAqjVApNk91lpD9JtJ9Xvj9zH4z1fsZNNlY5BNp55BNlan0Os5Apw.04j"}',
    ],

    ['X-Apple-Locale', 'en_US'],

    [
      'X-Apple-Widget-Key',
      'd39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d',
    ],
  ]

  // headers.push(...getSessionCookiesHeaders(session))
  if (isSome(session.scnt)) {
    headers.push(['scnt', session.scnt.value])
  }

  if (isSome(session.sessionId)) {
    headers.push(['X-Apple-ID-Session-Id', session.sessionId.value])
  }

  if (isSome(session.authAttributes)) {
    headers.push(['X-Apple-Auth-Attributes', session.authAttributes.value])
  }

  return headers
}

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
