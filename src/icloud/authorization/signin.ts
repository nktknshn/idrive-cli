import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import { getHeader } from '../../lib/cookie'
import { UnexpectedResponse } from '../../lib/errors'
import { FetchClientEither, HttpResponse } from '../../lib/fetch-client'
import { ErrorReadingResponseBody, InvalidJsonInResponse } from '../../lib/json'
import { logger } from '../../lib/logging'
import { createHttpResponseReducer, ResponseWithSession } from '../../lib/response-reducer'
import { ICloudSessionState } from '../session/session'
import { getBasicRequest } from '../session/session-http'
import { ICloudSessionValidated } from './authorize'

type SignInResponse = SignInResponse409 | SignInResponse200

type SignInResponse409Body = {
    authType?: string
}

interface SignInResponse409 {
    readonly tag: 'SignInResponse409'
    twoSVTrustEligible?: boolean
    hsa2Required: boolean
    authType: string
    httpResponse: HttpResponse
}

interface SignInResponse200 {
    readonly tag: 'SignInResponse200'
    httpResponse: HttpResponse
}

interface SignInResponseOther {
    readonly tag: 'SignInResponseOther'
    httpResponse: HttpResponse
}

export const hsa2Required = (response: SignInResponse): response is SignInResponse409 & { hsa2Required: true } =>
    response.tag === 'SignInResponse409' && response.authType == 'hsa2'

function getResponse(
    httpResponse: HttpResponse,
    json: E.Either<ErrorReadingResponseBody | InvalidJsonInResponse, unknown>
): E.Either<Error | UnexpectedResponse | ErrorReadingResponseBody | InvalidJsonInResponse, { httpResponse: HttpResponse, body: SignInResponse }> {
    if (httpResponse.status == 409) {
        if (E.isLeft(json)) {
            return json
        }

        let responseBody: SignInResponse409Body = json.right as SignInResponse409Body

        if (typeof responseBody.authType !== 'string') {
            return E.left(new Error('SignInResponse409Body: missing authType'))
        }

        const twoSVTrustEligible =
            pipe(
                httpResponse.headers,
                getHeader('X-Apple-TwoSV-Trust-Eligible'),
                O.map(_ => _ == 'true'),
                O.toUndefined
            )

        return E.right({
            httpResponse,
            body: {
                authType: responseBody.authType,
                twoSVTrustEligible,
                httpResponse,
                hsa2Required: responseBody.authType == 'hsa2',
                tag: 'SignInResponse409',
            }
        })
    }
    else if (httpResponse.status == 200) {
        return E.right({
            httpResponse,
            body: {
                tag: 'SignInResponse200',
                httpResponse
            }
        })
    }

    return E.left(new UnexpectedResponse(httpResponse, json))
}


export function requestSignIn(
    client: FetchClientEither,
    session: ICloudSessionState,
    { accountName, password, trustTokens }: {
        accountName: string
        password: string
        trustTokens: string[]
    }
): TE.TaskEither<Error, ResponseWithSession<SignInResponse>> {
    logger.debug('requestSignIn')

    const applyHttpResponseToSession = createHttpResponseReducer(getResponse)

    return pipe(
        session,
        getBasicRequest(
            'POST',
            'https://idmsa.apple.com/appleauth/auth/signin?isRememberMeEnabled=true',
            {
                accountName,
                password,
                trustTokens,
                rememberMe: true,
            }
        ),
        client,
        TE.chainW(applyHttpResponseToSession(session)),
    )
}
