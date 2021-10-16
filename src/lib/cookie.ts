import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
// import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import { SessionCookies } from '../icloud/session/session'
import { Cookie } from '../icloud/types'
import { splitPair } from './util'

type CookieAttribute =
  | { attributeKind: 'Domain'; value: string }
  | { attributeKind: 'Path'; value: string }
  | { attributeKind: 'Max-Age'; value: string }
  | { attributeKind: 'Expires'; value: string }
  | { attributeKind: 'Secure' }
  | { attributeKind: 'HttpOnly' }

const comparCaseless = (a: string, b: string) => a.toLowerCase() == b.toLowerCase()

function readCookiePairAttribute(
  key: string,
  value: string,
): O.Option<CookieAttribute> {
  if (comparCaseless(key, 'Domain')) {
    return O.some({ attributeKind: 'Domain' as const, value })
  } else if (comparCaseless(key, 'Path')) {
    return O.some({ attributeKind: 'Path' as const, value })
  }
  if (comparCaseless(key, 'Max-Age')) {
    return O.some({ attributeKind: 'Max-Age' as const, value })
  } else if (comparCaseless(key, 'Expires')) {
    return O.some({ attributeKind: 'Expires' as const, value })
  }
  return O.none
}

function readCookieFlagAttribute(key: string): O.Option<CookieAttribute> {
  if (comparCaseless(key, 'Secure')) {
    return O.some({ attributeKind: 'Secure' as const })
  } else if (comparCaseless(key, 'HttpOnly')) {
    return O.some({ attributeKind: 'HttpOnly' as const })
  }
  return O.none
}

export function parseAttributes(
  attributes: string[],
): E.Either<string, CookieAttribute>[] {
  return attributes.map((attr) =>
    pipe(
      splitPair('=', attr),
      O.map(([key, value]) => readCookiePairAttribute(key, value)),
      O.getOrElse(() => readCookieFlagAttribute(attr)),
      E.fromOption(() => `invalid attribute: ${attr}`),
    )
  )
}

function reduceCookieAttributes(
  cookie: Cookie,
  attributes: CookieAttribute[],
): Cookie {
  return attributes.reduce((acc, attr) => {
    if (attr.attributeKind === 'Domain') {
      return { ...acc, domain: attr.value }
    } else if (attr.attributeKind === 'Path') {
      return { ...acc, path: attr.value }
    } else if (attr.attributeKind === 'HttpOnly') {
      return { ...acc, httpOnly: true }
    } else if (attr.attributeKind === 'Secure') {
      return { ...acc, secure: true }
    } else if (attr.attributeKind === 'Expires') {
      return { ...acc, expires: new Date(attr.value) }
    } else if (attr.attributeKind === 'Max-Age') {
      return { ...acc, maxAge: Number.parseInt(attr.value) }
    }

    // will never reach this
    return attr
  }, cookie)
}

export function parseSetCookie(setCookie: string): E.Either<string, Cookie> {
  const parts = setCookie.split(';').map((_) => _.trim())

  if (parts.length == 0) {
    return E.left('empty cookie')
  }

  const [keyVal, ...attributes] = parts
  const { left: errors, right: cookieAttributes } = A.separate(
    parseAttributes(attributes),
  )

  if (errors.length > 0) {
    console.error(errors)
    console.error(setCookie)
  }

  return pipe(
    splitPair('=', keyVal),
    E.fromOption(() => `missing keyVal while parsing: ${setCookie}`),
    E.map(([name, value]) => ({ name, value })),
    E.map((cookie) => reduceCookieAttributes(cookie, cookieAttributes)),
  )
}

export function applyCookieToCookies(cookies: SessionCookies, add: Cookie[]): SessionCookies {
  const newCookies = Object.assign({}, cookies)

  for (const cookie of add) {
    if (cookie.maxAge == 0 && newCookies[cookie.name]) {
      delete newCookies[cookie.name]
    } else {
      newCookies[cookie.name] = cookie
    }
  }

  return newCookies
}
