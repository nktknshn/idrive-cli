import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { createHttpResponseReducer, ResponseWithSession } from '../../lib/response-reducer'
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
}

export function requestSecurityCode(
    { session, code, client }: SecurityCodeRequestProps
): TE.TaskEither<Error, ResponseWithSession<SecurityCodeResponse204>> {
    logger.debug(`requestSecurityCode: ${code}`)

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

    function createSecurityCodeRequest(): HttpRequest {
        return new HttpRequest(
            'https://idmsa.apple.com/appleauth/auth/verify/trusteddevice/securitycode',
            {
                method: 'POST',
                headers: buildRecord(
                    getSessionHeaders(
                        session
                    )
                ),
                body: {
                    securityCode: { code }
                },
            }
        )
    }

    return pipe(
        createSecurityCodeRequest(),
        client,
        TE.chainW(applyResponse(session))
    )
}
