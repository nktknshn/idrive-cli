import * as t from 'io-ts'
import { Option } from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import * as E from 'fp-ts/lib/Either'
import * as O from 'fp-ts/lib/Option'

import { ICloudSessionState } from '../session/session'
import { flow, pipe } from 'fp-ts/lib/function'
import { createHttpResponseReducer } from '../../lib/createHttpResponseReducer'
import { ErrorReadingResponseBody, InvalidJsonInResponse } from '../../lib/json'
import { FetchClientEither, HttpRequest, HttpResponse } from '../../lib/fetch-client'
import { getSessionHeaders } from '../session/session-http-headers'
import { reduceHttpResponseToSession } from '../session/session-http'
import { getTrustToken } from '../../lib/http-headers'
import { error, UnexpectedResponse } from '../../lib/errors'
import { FetchError } from '../../lib/fetch-client'
import { logger } from '../../lib/logging'
import { buildRecord } from '../../lib/util'

type TrustResponse =
    | TrustResponse204
// | TrustResponseOther

export interface TrustResponse204 {
    readonly tag: 'TrustResponse204'
    httpResponse: HttpResponse
    trustToken: string
}

// interface TrustResponseOther {
//     readonly tag: 'TrustResponseOther'
//     httpResponse: Response
// }

type RequestProps = {
    session: ICloudSessionState
    client: FetchClientEither,
}

function createRequest(
    { session }: RequestProps
): HttpRequest {
    return new HttpRequest(
        'https://idmsa.apple.com/appleauth/auth/2sv/trust',
        {
            method: 'GET',
            headers: buildRecord(
                getSessionHeaders(
                    session
                )
            )
        }
    )
}

export function getResponse(
    httpResponse: HttpResponse,
    json: E.Either<unknown, unknown>
) {
    if (httpResponse.status == 204) {
        return pipe(
            getTrustToken(httpResponse.headers),
            O.map(trustToken => ({
                httpResponse,
                body: { trustToken, tag: 'TrustResponse204' as const }
            })),
            E.fromOption(() => error("Missing trust token"))
        )
    }

    return E.left(UnexpectedResponse.create(httpResponse, json))
}


const applyHttpResponseToSession = createHttpResponseReducer(
    getResponse,
    (session, response) => Object.assign(
        reduceHttpResponseToSession(
            session,
            response.httpResponse
        ),
        { trustToken: O.some(response.body.trustToken) }
    )

)

export function requestTrustDevice(
    props: RequestProps
) {

    logger.debug('requestTrustDevice')

    return pipe(
        createRequest(props),
        props.client,
        TE.chainW(applyHttpResponseToSession(props.session)),
        // TE.map(({ session, response }) => [session, response] as const)
    )
}
