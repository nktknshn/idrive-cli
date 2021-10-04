import { applyCookieToCookies, parseSetCookie } from "../../lib/cookie";
import { getAccountCountry, getAuthAttributes, getScnt, getSessionId, getSessionToken, getSetCookie } from "../../lib/http-headers";
import { separateEithers } from "../../lib/util";
import { ICloudSessionState } from "./session";
import * as O from "fp-ts/lib/Option";
import * as A from "fp-ts/lib/Array";

import { flow, Lazy, pipe } from "fp-ts/lib/function";
import { ICloudBasicResponse } from "../types";
import { HttpResponse } from "../../lib/fetch-client";
import { logger } from "../../lib/logging";

const fallback = <A>(onNone: Lazy<O.Option<A>>): (v: O.Option<A>) => O.Option<A> =>
    O.fold(onNone, O.some)

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
