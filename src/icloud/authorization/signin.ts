import * as t from 'io-ts'
import { Option } from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import * as E from 'fp-ts/lib/Either'
import * as O from 'fp-ts/lib/Option'
import * as R from 'fp-ts/lib/Record'
import * as A from 'fp-ts/lib/Array'

import { ICloudSessionState } from '../session/session'
import { flow, pipe } from 'fp-ts/lib/function'
import { createHttpResponseReducer } from '../../lib/createHttpResponseReducer'
import { ErrorReadingResponseBody, InvalidJsonInResponse } from '../../lib/json'
import { FetchClientEither, HttpRequest, HttpResponse } from '../../lib/fetch-client'
import { getSessionHeaders } from '../session/session-http-headers'
import { reduceHttpResponseToSession } from '../session/session-http'
import { FetchError } from '../../lib/fetch-client'
import { UnexpectedResponse } from './securitycode'
import { logger } from '../../lib/logging'
import { buildRecord } from '../../lib/util'
// import { Eq } from 'fp-ts/lib/string'

interface RequestSignInProps {
    client: FetchClientEither,
    session: ICloudSessionState
    accountName: string
    password: string
    trustTokens: string[]
}

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

const getHeader = (header: string) => (headers: HttpResponse['headers']) =>
    pipe(
        headers,
        R.toArray,
        A.findFirst(([k, v]) => k.toLowerCase() == header.toLowerCase()),
        O.map(_ => _[1])
    )
    // O.fromNullable(
        // headers.get(header)
        // R.lookup(header)(headers)
    // )

export const hsa2Required = (response: SignInResponse): response is SignInResponse409 & { hsa2Required: true } =>
    response.tag === 'SignInResponse409' && response.authType == 'hsa2'

function getResponse(
    httpResponse: HttpResponse,
    json: E.Either<ErrorReadingResponseBody | InvalidJsonInResponse, unknown>
): E.Either<Error | UnexpectedResponse | ErrorReadingResponseBody | InvalidJsonInResponse, SignInResponse> {
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
            authType: responseBody.authType,
            twoSVTrustEligible,
            httpResponse,
            hsa2Required: responseBody.authType == 'hsa2',
            tag: 'SignInResponse409',
        })
    }
    else if (httpResponse.status == 200) {
        return E.right({
            tag: 'SignInResponse200',
            httpResponse
        })
    }

    return E.left(new UnexpectedResponse(httpResponse, json))
}

function createRequest(
    { session, accountName, password, trustTokens = [] }: RequestSignInProps
) {
    return new HttpRequest(
        'https://idmsa.apple.com/appleauth/auth/signin?isRememberMeEnabled=true',
        {
            method: 'POST',
            headers: buildRecord(getSessionHeaders(
                session
            )),
            body: JSON.stringify({
                accountName,
                password,
                trustTokens,
                rememberMe: true,
            }),
        })
}

const applyHttpResponseToSession = createHttpResponseReducer(
    getResponse,
    (sess, resp) => reduceHttpResponseToSession(sess, resp.httpResponse)
)

export function requestSignIn(
    props: RequestSignInProps
): TE.TaskEither<
    Error | UnexpectedResponse | FetchError | ErrorReadingResponseBody | InvalidJsonInResponse,
    readonly [ICloudSessionState, SignInResponse]
> {
    logger.debug('requestSignIn')

    return pipe(
        createRequest(props),
        props.client,
        TE.chainW(applyHttpResponseToSession(props.session)),
        TE.map(({ session, response }) => [session, response] as const)
    )
}
