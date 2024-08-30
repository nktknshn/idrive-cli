import { constant } from 'fp-ts/lib/function'
import { ICloudSession } from './session-type'

export type Header = [string, string]

const basicHeaders: Header[] = [
  ['Origin', 'https://www.icloud.com'],
  ['Referer', 'https://www.icloud.com'],
  ['Accept', 'application/json, text/javascript, */*; q=0.01'],
  ['Content-Type', 'application/json'],
]

export function getSessionCookiesHeaders(
  session: ICloudSession,
): Header[] {
  const headers: Header[] = []
  if (Object.values(session.cookies).length) {
    headers.push([
      'Cookie',
      Object.values(session.cookies)
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join(';'),
    ])
  }
  return headers
}

export const headers = {
  basicHeaders: constant(basicHeaders),
  default: (session: ICloudSession): Header[] => [...getSessionCookiesHeaders(session), ...basicHeaders],
}
