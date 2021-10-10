import * as t from 'io-ts'
import { Option } from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import * as E from 'fp-ts/lib/Either'
import * as O from 'fp-ts/lib/Option'

import { ICloudSessionState } from '../session/session'
import { flow, pipe } from 'fp-ts/lib/function'
import { createHttpResponseReducer } from '../../lib/response-reducer'
import { ErrorReadingResponseBody, InvalidJsonInResponse } from '../../lib/json'
import { FetchClientEither, HttpRequest, HttpResponse } from '../../lib/fetch-client'
import { getSessionHeaders } from '../session/session-http-headers'
import { getBasicRequest, reduceHttpResponseToSession } from '../session/session-http'
import { getTrustToken } from '../../lib/http-headers'
import { error, UnexpectedResponse } from '../../lib/errors'
import { FetchError } from '../../lib/fetch-client'
import { logger } from '../../lib/logging'
import { buildRecord } from '../../lib/util'
import { ICloudSessionValidated } from './authorize'

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
    client: FetchClientEither,
    session: ICloudSessionState,
) {

    logger.debug('requestTrustDevice')

    return pipe(
        session,
        getBasicRequest('GET', 'https://idmsa.apple.com/appleauth/auth/2sv/trust'),
        client,
        TE.chainW(applyHttpResponseToSession(session)),
    )
}
