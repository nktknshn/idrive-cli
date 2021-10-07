import * as t from 'io-ts'
import { isSome, Option, Some } from 'fp-ts/lib/Option'
import * as O from 'fp-ts/lib/Option'
// import { Cookie } from './types';
// import  * as webdav from 'webdav-server'
import { option } from 'io-ts-types/lib/option'
import { DateFromISOString, optionFromNullable } from 'io-ts-types';
import { string } from 'fp-ts';
import { Cookie } from '../types';

const optionalString = option(t.string)

const optional = <T extends t.Mixed>(type: T): t.UnionC<[t.UndefinedC, T]> => t.union([t.undefined, type])

const cookieScheme = t.intersection([
    t.type({
        name: t.string,
        value: t.string
    }),
    t.partial({
        expires: DateFromISOString,
        maxAge: t.number,
        domain: t.string,
        path: t.string,
        secure: t.boolean,
        httpOnly: t.boolean,
    })
])

export const sessionScheme = t.type({
    username: t.string,
    password: t.string,
    cookies: t.record(t.string, cookieScheme),
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

export interface ICloudSessionState extends t.TypeOf<typeof sessionScheme> { }
export interface ICloudSignInCredentials extends t.TypeOf<typeof signInCredentials> { }

export const session = (
    username: string,
    password: string
): ICloudSessionState => ({
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

export interface SessionCookies {
    [name: string]: Cookie
}

export interface ICloudSessionWithSessionToken extends ICloudSessionState {
    sessionToken: Some<string>
}

export interface ICloudSessionTrusted extends ICloudSessionWithSessionToken {
    trustToken: Some<string>
}

export function hasTrustedToken(session: ICloudSessionState): session is ICloudSessionTrusted {
    return isSome(session.sessionToken) && isSome(session.trustToken)
}

export function hasSessionToken(session: ICloudSessionState): session is ICloudSessionWithSessionToken {
    return isSome(session.sessionToken)
}
