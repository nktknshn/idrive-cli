import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import { basicGetResponse, createHttpResponseReducer, JsonEither } from '../../lib/response-reducer'
import { FetchError, HttpRequest, HttpResponse } from '../../lib/fetch-client'
import { ErrorReadingResponseBody, InvalidJsonInResponse } from '../../lib/json'
import { logger } from '../../lib/logging'
import { ICloudSessionState } from '../session/session'
import { reduceHttpResponseToSession } from '../session/session-http'
import { basicHeaders } from '../session/session-http-headers'
import { FetchClientEither } from '../../lib/fetch-client'
import { AccountLoginResponseBody } from './accoutLoginResponseType'
import { ICloudSessionValidated } from './authorize'
import { buildRecord, isObjectWithOwnProperty } from '../../lib/util'
import { UnexpectedResponse } from '../../lib/errors'

type AccountLoginRequestProps = {
    client: FetchClientEither,
    session: ICloudSessionState
}

export interface AccountLoginResponse200 {
    readonly tag: 'AccountLoginResponse200'
    unsafeBody: AccountLoginResponseBody
    httpResponse: HttpResponse
}

export class AccountLoginResponse421 extends Error {
    readonly tag = 'AccountLoginResponse421'
    constructor(public readonly httpResponse: HttpResponse, public readonly body: unknown) { super() }
    static is(v: Error): v is AccountLoginResponse421 {
        return v instanceof AccountLoginResponse421
    }
    static create(
        httpResponse: HttpResponse, body: unknown
    ) {
        return new AccountLoginResponse421(httpResponse, body)
    }
}

function createRequest(
    { session }: Record<'session', ICloudSessionState>
): E.Either<Error, HttpRequest> {
    return pipe(
        session.sessionToken,
        O.map(sessionToken => new HttpRequest(
            'https://setup.icloud.com/setup/ws/1/accountLogin?clientBuildNumber=2114Project37&clientMasteringNumber=2114B28&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e',
            {
                method: 'POST',
                headers: buildRecord(basicHeaders),
                body: {
                    "dsWebAuthToken": sessionToken,
                    "trustToken": O.toUndefined(session.trustToken),
                    "accountCountryCode": "RUS",
                    "extended_login": false
                }
            }
        )),
        E.fromOption(() => new Error('missing sessionToken'))
    )
}

export function getResponse(
    httpResponse: HttpResponse,
    json: JsonEither
): E.Either<Error, AccountLoginResponse200> {
    if (httpResponse.status == 200) {
        return pipe(
            json,
            E.map(json => ({
                tag: 'AccountLoginResponse200',
                unsafeBody: json as AccountLoginResponseBody,
                httpResponse,
            }))
        )
    }
    else if (httpResponse.status == 421) {
        return E.left(AccountLoginResponse421.create(
            httpResponse,
            pipe(json, E.getOrElseW(() => undefined))
        ))
    }
    else {
        return E.left(UnexpectedResponse.create(httpResponse, json))
    }
}

const applyResponse = createHttpResponseReducer(
    basicGetResponse((json): json is AccountLoginResponseBody => isObjectWithOwnProperty(json, 'appsOrder')),
    (sess, resp) => reduceHttpResponseToSession(sess, resp.httpResponse)
)

export function requestAccoutLogin(
    { client, session }: AccountLoginRequestProps
): TE.TaskEither<
    Error | FetchError | ErrorReadingResponseBody | InvalidJsonInResponse,
    ICloudSessionValidated
> {
    logger.debug('requestAccoutLogin')

    return pipe(
        TE.fromEither(createRequest({ session })),
        TE.chainW(client),
        TE.chainW(applyResponse(session)),
        TE.map(({ session, response }) => ({
            session,
            accountData: response.body
        }))
    )
}
