import * as TE from "fp-ts/lib/TaskEither"
import * as O from "fp-ts/lib/Option";

export interface Cookie {
    /** Name of the cookie. */
    name: string;
    /** Value of the cookie. */
    value: string;
    /** Expiration date of the cookie. */
    expires?: Date;
    /** Max-Age of the Cookie. Max-Age must be an integer superior or equal to 0. */
    maxAge?: number;
    /** Specifies those hosts to which the cookie will be sent. */
    domain?: string;
    /** Indicates a URL path that must exist in the request. */
    path?: string;
    /** Indicates if the cookie is made using SSL & HTTPS. */
    secure?: boolean;
    /** Indicates that cookie is not accessible via JavaScript. **/
    httpOnly?: boolean;
    /** Allows servers to assert that a cookie ought not to
     * be sent along with cross-site requests. */
    sameSite?: "Strict" | "Lax" | "None";
    /** Additional key value pairs with the form "key=value" */
    unparsed?: string[];
}


export interface ICloudBasicResponse {
    setCookies: Cookie[]
    sessionId: O.Option<string>
    accountCountry: O.Option<string>
    sessionToken: O.Option<string>
    authAttributes: O.Option<string>
    scnt: O.Option<string>
}