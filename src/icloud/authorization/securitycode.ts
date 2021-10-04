import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import { createHttpResponseReducer } from '../../lib/createHttpResponseReducer'
import { FetchError, HttpRequest, HttpResponse } from '../../lib/fetch-client'
import { ErrorReadingResponseBody, InvalidJsonInResponse } from '../../lib/json'
import { logger } from '../../lib/logging'
import { buildRecord, isObjectWithOwnProperty } from '../../lib/util'
import { ICloudSessionState } from '../session/session'
import { reduceHttpResponseToSession } from '../session/session-http'
import { basicHeaders, getSessionHeaders } from '../session/session-http-headers'
import { FetchClientEither } from '../../lib/fetch-client'
import { AccountLoginResponseBody } from './accoutLoginResponseType'

interface SecurityCodeRequestProps {
    session: ICloudSessionState
    code: string
    client: FetchClientEither,
}

type SecurityCodeResponse = SecurityCodeResponse204
type SecurityCodeResponseReducable = SecurityCodeResponse204

export interface SecurityCodeResponse204 {
    readonly tag: 'SecurityCodeResponse204'
    httpResponse: HttpResponse
}

// export interface SecurityCodeResponseOther {
//     readonly tag: 'SecurityCodeResponseOther'
//     statusCode: number
//     httpResponse: Response
// }

export class UnexpectedResponse extends Error {
    readonly tag = 'UnexpectedResponse'
    constructor(
        public readonly httpResponse: HttpResponse,
        public readonly json: E.Either<unknown, unknown>,
    ) { 
        super ()
    }
    
    static is(error: unknown): error is UnexpectedResponse {
        return isObjectWithOwnProperty(error, 'tag') && error.tag === 'UnexpectedResponse'
    }

    static create(
        httpResponse: HttpResponse,
        json: E.Either<unknown, unknown>
    ) {
        return new UnexpectedResponse(httpResponse, json)
    }

    [Symbol.toString()]() {
        return `UnexpectedResponse(${this.httpResponse.status}, ${JSON.stringify(this.json)})`
    }
}

export function createSecurityCodeRequest(
    { session, code }: SecurityCodeRequestProps
): HttpRequest {
    return new HttpRequest(
        'https://idmsa.apple.com/appleauth/auth/verify/trusteddevice/securitycode',
        {
            method: 'POST',
            headers: buildRecord(
                getSessionHeaders(
                    session
                )
            ),
            body: JSON.stringify({
                securityCode: { code }
            }),
        }
    )
}

export function httpResponseToResponse(
    httpResponse: HttpResponse,
    json: E.Either<unknown, unknown>
): E.Either<UnexpectedResponse, SecurityCodeResponse> {
    if (httpResponse.status == 204) {
        return E.right({
            tag: 'SecurityCodeResponse204',
            httpResponse
        })
    }
    else {
        return E.left(new UnexpectedResponse(httpResponse, json))
    }
}

export function requestSecurityCode(
    props: SecurityCodeRequestProps
): TE.TaskEither<
    FetchError | UnexpectedResponse | ErrorReadingResponseBody | InvalidJsonInResponse,
    { session: ICloudSessionState; response: SecurityCodeResponse }
> {
    logger.debug(`requestSecurityCode: ${props.code}`)

    return pipe(
        props.client(createSecurityCodeRequest(props)),
        TE.chainW(applyResponse(props.session))
    )
}

const applyResponse = createHttpResponseReducer(
    httpResponseToResponse,
    (sess, resp) => reduceHttpResponseToSession(sess, resp.httpResponse)
)
