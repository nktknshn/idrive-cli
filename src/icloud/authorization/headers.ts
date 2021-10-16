import { isSome } from 'fp-ts/lib/Option'
import { ICloudSession } from '../session/session'
import { Header } from '../session/session-http-headers'

export const authorizationHeaders = (
  session: ICloudSession,
): Header[] => {
  // let headers: Header[] = []
  const headers: Header[] = [
    //     ...basicHeaders,
    ['X-Apple-Domain-Id', '3'],
    //     // X-Apple-Auth-Attributes: 9mTVK8hdwUAzJD8sa/OgsDZOV17uJJpoI3424aRxQOpU47ZwYufYshcjAq6YGP6MCKMwgYUCybogzkYXQ/vmzHDu4VS4Wz1GVBA7l4U/RlRQ1B5hTFN2fysJ7pEE9fdN2W2GnJVzuWP67nwAEPHzyO+dQQ==
    //     // ["X-Apple-Frame-Id", "auth-aph1jmh7-2cjb-g49k-rr06-tbft0b7t"],
    [
      'X-Apple-I-FD-Client-Info',
      '{"U":"Mozilla/5.0 (X11; Linux x86_64; rv:90.0) Gecko/20100101 Firefox/90.0","L":"en-US","Z":"GMT+03:00","V":"1.1","F":"7ta44j1e3NlY5BNlY5BSs5uQ084akJ1ic3WuWJ4MPuQVD_DJhCizgzH_y3EjNklYAqjVApNk91lpD9JtJ9Xvj9zH4z1fsZNNlY5BNp55BNlan0Os5Apw.04j"}',
    ],

    ['X-Apple-Locale', 'en_US'],
    //     // ["X-Apple-OAuth-Client-Id", "d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d"],
    //     // ["X-Apple-OAuth-Client-Type", "firstPartyAuth"],
    //     // ["X-Apple-OAuth-Redirect-URI", "https://www.icloud.com"],
    //     // ["X-Apple-OAuth-Require-Grant-Code", "true"],
    //     // ["X-Apple-OAuth-Response-Mode", "web_message"],
    //     // ["X-Apple-OAuth-Response-Type", "code"],
    [
      'X-Apple-Widget-Key',
      'd39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d',
    ],
    //     // ["X-Apple-OAuth-State", session.oauthState],
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
