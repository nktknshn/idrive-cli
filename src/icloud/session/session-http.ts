import { Method } from "axios";
import FormData from 'form-data';
import * as A from "fp-ts/lib/Array";
import { Lazy, pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import { applyCookieToCookies, parseSetCookie } from "../../lib/cookie";
import { HttpRequest, HttpResponse } from "../../lib/fetch-client";
import { getAccountCountry, getAuthAttributes, getScnt, getSessionId, getSessionToken, getSetCookie } from "../../lib/http-headers";
import { buildRecord, separateEithers } from "../../lib/util";
import { ICloudBasicResponse } from "../types";
import { ICloudSessionState } from "./session";
import { Header, headers } from "./session-http-headers";


const fallback = <A>(onNone: Lazy<O.Option<A>>): (v: O.Option<A>) => O.Option<A> =>
    O.fold(onNone, O.some)

const defaultHeaders: ((session: ICloudSessionState) => Header[])[] =
    [headers.basicHeaders, headers.sessionCookiesHeaders]

export const getBasicRequest = (
    method: Method,
    url: string,
    { data = undefined, headers = defaultHeaders }: {
        data?: unknown
        headers?: ((session: ICloudSessionState) => Header[])[]
    } = {}
): (session: ICloudSessionState) => HttpRequest => {
    return session => ({
        url,
        method,
        headers: buildRecord(pipe(headers, A.map(f => f(session)), A.flatten)),
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
