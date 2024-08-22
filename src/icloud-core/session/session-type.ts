import * as O from 'fp-ts/lib/Option'
import { isSome, Some } from 'fp-ts/lib/Option'
import * as t from 'io-ts'
import * as m from 'monocle-ts'
import { DateFromISOString } from '../../util/io-date'
import { option } from '../../util/io-option'

const optionalString = option(t.string)

const cookieScheme = t.intersection([
  t.type({
    name: t.string,
    value: t.string,
  }),
  t.partial({
    expires: DateFromISOString,
    maxAge: t.number,
    domain: t.string,
    path: t.string,
    secure: t.boolean,
    httpOnly: t.boolean,
  }),
])

const cookies = t.record(t.string, cookieScheme)

export const sessionScheme = t.type({
  username: t.string,
  password: t.string,
  cookies,
  sessionId: optionalString,
  sessionToken: optionalString,
  accountCountry: optionalString,
  trustToken: optionalString,
  authAttributes: optionalString,
  scnt: optionalString,
})

export const signInCredentials = t.type({
  username: t.string,
  password: t.string,
})

/** Authenticated session */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ICloudSession extends t.TypeOf<typeof sessionScheme> {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ICloudSignInCredentials extends t.TypeOf<typeof signInCredentials> {}

export const session = (
  username: string,
  password: string,
): ICloudSession => ({
  username,
  password,
  trustToken: O.none,
  accountCountry: O.none,
  authAttributes: O.none,
  cookies: {},
  scnt: O.none,
  sessionId: O.none,
  sessionToken: O.none,
})

export type SessionCookies = t.TypeOf<typeof cookies>

export interface ICloudSessionWithSessionToken extends ICloudSession {
  sessionToken: Some<string>
}

export interface ICloudSessionTrusted extends ICloudSessionWithSessionToken {
  trustToken: Some<string>
}

export function hasTrustedToken(
  session: ICloudSession,
): session is ICloudSessionTrusted {
  return isSome(session.sessionToken) && isSome(session.trustToken)
}

export function hasSessionToken(
  session: ICloudSession,
): session is ICloudSessionWithSessionToken {
  return isSome(session.sessionToken)
}

export const sessionLens = {
  cookies: m.Lens.fromProps<ICloudSession>()(['cookies']),
  trustToken: m.Lens.fromProp<ICloudSession>()('trustToken'),
}
