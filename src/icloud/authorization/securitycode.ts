import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { createHttpResponseReducer } from '../../lib/createHttpResponseReducer'
import { UnexpectedResponse } from '../../lib/errors'
import { FetchClientEither, HttpRequest, HttpResponse } from '../../lib/fetch-client'
import { logger } from '../../lib/logging'
import { buildRecord } from '../../lib/util'
import { ICloudSessionState } from '../session/session'
import { reduceHttpResponseToSession } from '../session/session-http'
import { getSessionHeaders } from '../session/session-http-headers'

interface SecurityCodeRequestProps {
    session: ICloudSessionState
    code: string
    client: FetchClientEither,
}

type SecurityCodeResponse = SecurityCodeResponse204
type SecurityCodeResponseReducable = SecurityCodeResponse204

export interface SecurityCodeResponse204 {
    readonly tag: 'SecurityCodeResponse204'
    // httpResponse: HttpResponse
}

// export interface SecurityCodeResponseOther {
//     readonly tag: 'SecurityCodeResponseOther'
//     statusCode: number
//     httpResponse: Response
// }

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

// export function httpResponseToResponse(
//     httpResponse: HttpResponse,
//     json: E.Either<unknown, unknown>
// ): E.Either<UnexpectedResponse, SecurityCodeResponse> {
//     if (httpResponse.status == 204) {
//         return E.right({
//             response: { tag: 'SecurityCodeResponse204' },
//             httpResponse
//         })
//     }
//     else {
//         return E.left(new UnexpectedResponse(httpResponse, json))
//     }
// }

export function requestSecurityCode(
    props: SecurityCodeRequestProps
): TE.TaskEither<
    Error,
    { session: ICloudSessionState; response: { httpResponse: HttpResponse, body: SecurityCodeResponse204} }
> {
    logger.debug(`requestSecurityCode: ${props.code}`)

    return pipe(
        createSecurityCodeRequest(props),
        props.client,
        TE.chainW(applyResponse(props.session))
    )
}

const applyResponse = createHttpResponseReducer(
    (httpResponse, json) => {
        if (httpResponse.status == 204) {
            return E.right({
                body: { tag: 'SecurityCodeResponse204' as const },
                httpResponse
            })
        }
        else {
            return E.left(new UnexpectedResponse(httpResponse, json))
        }
    },
    (sess, resp) => reduceHttpResponseToSession(sess, resp.httpResponse)
)
