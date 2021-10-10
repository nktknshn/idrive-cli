import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { UnexpectedResponse } from '../../lib/errors'
import { FetchClientEither } from '../../lib/fetch-client'
import { logger } from '../../lib/logging'
import { createHttpResponseReducer, ResponseWithSession } from '../../lib/response-reducer'
import { ICloudSessionState } from '../session/session'
import { getBasicRequest, reduceHttpResponseToSession } from '../session/session-http'

interface SecurityCodeRequestProps {
    session: ICloudSessionState
    code: string
    client: FetchClientEither,
}

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

    return pipe(
        session,
        getBasicRequest('POST', 'https://idmsa.apple.com/appleauth/auth/verify/trusteddevice/securitycode', {
            data: { securityCode: { code } }
        }),
        client,
        TE.chainW(applyResponse(session))
    )
}
