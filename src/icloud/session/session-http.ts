import { applyCookieToCookies, parseSetCookie } from "../../lib/cookie";
import { getAccountCountry, getAuthAttributes, getScnt, getSessionId, getSessionToken, getSetCookie } from "../../lib/http-headers";
import { buildRecord, separateEithers } from "../../lib/util";
import { ICloudSessionState } from "./session";
import * as O from "fp-ts/lib/Option";
import * as A from "fp-ts/lib/Array";

import { flow, Lazy, pipe } from "fp-ts/lib/function";
import { ICloudBasicResponse } from "../types";
import { HttpRequest, HttpResponse } from "../../lib/fetch-client";
import { logger } from "../../lib/logging";
import { Method } from "axios";
import { basicHeaders, getSessionCookiesHeaders } from "./session-http-headers";

import Path from 'path'
import FormData from 'form-data'
import { TextDecoder } from 'util'
import * as fs from 'fs/promises'
/* 
describe('FormData', () => {
    it('w', () => {
        const form = new FormData()

        form.append('files', fs.readFileSync('/etc/passwd'), { filename: 'abcdef.txt' })

        console.log(
            form.getHeaders()
        );

        console.log(
            new TextDecoder().decode(
                form.getBuffer()
            )
        );

    })
}) */

const fallback = <A>(onNone: Lazy<O.Option<A>>): (v: O.Option<A>) => O.Option<A> =>
    O.fold(onNone, O.some)

export const getBasicRequest = (
    method: Method,
    url: string,
    data: unknown = undefined
): (session: ICloudSessionState) => HttpRequest => {
    return session => ({
        url,
        method,
        headers: buildRecord([
            ...basicHeaders,
            ...getSessionCookiesHeaders(
                session
            )]),
        data
    })
}

export const uploadFileRequest = (
    url: string,
    filename: string,
    fileBuffer: Buffer
): HttpRequest => {
    const formData = new FormData();
    // formData.append('name', 'files')
    formData.append('files', fileBuffer, { filename })

    return ({
        url,
        method: 'POST',
        headers: formData.getHeaders(),
        data: formData.getBuffer()
    })
}

export function getBasicResponse(httpResponse: HttpResponse): ICloudBasicResponse {

    // console.log(
    //     Array.from(httpResponse.headers.())
    // );

    const [errors, setCookies] =
        pipe(
            getSetCookie(httpResponse.headers),
            A.map(parseSetCookie),
            separateEithers
        )

    if (errors.length > 0) {
        console.error(errors);
    }

    return {
        setCookies,
        scnt: getScnt(httpResponse.headers),
        sessionId: getSessionId(httpResponse.headers),
        sessionToken: getSessionToken(httpResponse.headers),
        accountCountry: getAccountCountry(httpResponse.headers),
        authAttributes: getAuthAttributes(httpResponse.headers),
    }
}

export function reduceHttpResponseToSession(
    session: ICloudSessionState,
    httpResponse: HttpResponse
): ICloudSessionState {

    const newSession = Object.assign({}, session)
    const response = getBasicResponse(httpResponse)

    newSession.cookies = applyCookieToCookies(
        session.cookies,
        response.setCookies
    )

    // logger.debug(
    //     newSession.cookies['X-APPLE-WEBAUTH-TOKEN']
    // )

    newSession.scnt = pipe(response.scnt, fallback(() => newSession.scnt))
    newSession.sessionId = fallback(() => newSession.sessionId)(response.sessionId)
    newSession.sessionToken = fallback(() => newSession.sessionToken)(response.sessionToken)
    newSession.accountCountry = fallback(() => newSession.accountCountry)(response.accountCountry)
    newSession.authAttributes = fallback(() => newSession.authAttributes)(response.authAttributes)

    return newSession
}
