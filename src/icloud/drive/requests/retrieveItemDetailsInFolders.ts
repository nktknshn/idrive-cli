import * as E from 'fp-ts/lib/Either'
import * as TE from 'fp-ts/lib/TaskEither'
import assert from "assert"
import { pipe } from 'fp-ts/lib/function'
import { DriveDetailsFolder } from '../types'
import { createHttpResponseReducer } from '../../../lib/createHttpResponseReducer'
import { HttpResponse, FetchClientEither, HttpRequest, FetchError } from '../../../lib/fetch-client'
import { ErrorReadingResponseBody, InvalidJsonInResponse } from '../../../lib/json'
import { buildRecord } from '../../../lib/util'
import { AccountLoginResponseBody } from '../../authorization/accoutLoginResponseType'
import { UnexpectedResponse } from '../../authorization/securitycode'
import { ICloudSessionState } from '../../session/session'
import { reduceHttpResponseToSession } from '../../session/session-http'
import { basicHeaders, getSessionCookiesHeaders } from '../../session/session-http-headers'

// https://p46-drivews.icloud.com/retrieveItemDetails

export class InvalidGlobalSessionResponse extends Error {
    readonly tag = 'InvalidGlobalSessionResponse'

    constructor(public readonly httpResponse: HttpResponse) { super() }

    public static is(a: unknown): a is InvalidGlobalSessionResponse {
        return a instanceof InvalidGlobalSessionResponse
    }
}

interface RetrieveOpts {
    client: FetchClientEither,
    validatedSession: {
        session: ICloudSessionState,
        accountData: AccountLoginResponseBody
    },
    drivewsids: string[]
    partialData: boolean,
    includeHierarchy: boolean
}

export interface DriveItemDetailsResponse {
    httpResponse: HttpResponse;
    details: DriveDetailsFolder[];
}

function getResponse(
    httpResponse: HttpResponse,
    json: E.Either<unknown, unknown>
): E.Either<UnexpectedResponse | InvalidGlobalSessionResponse, DriveItemDetailsResponse> {
    if (httpResponse.status == 200 && E.isRight(json)) {
        return E.right({
            httpResponse,
            details: json.right as DriveDetailsFolder[]
        })
    }
    else if (httpResponse.status == 421) {
        return E.left(new InvalidGlobalSessionResponse(httpResponse))
    }

    return E.left(new UnexpectedResponse(httpResponse, json))
}

function createHttpRequest(props: RetrieveOpts): HttpRequest {
    assert(props.validatedSession.accountData.webservices.drivews.url)
    return {
        headers: buildRecord([
            ...basicHeaders,
            ...getSessionCookiesHeaders(
                props.validatedSession.session
            )]),
        method: 'POST',
        url: `${props.validatedSession.accountData.webservices.drivews.url}/retrieveItemDetailsInFolders?dsid=${props.validatedSession.accountData.dsInfo.dsid}&appIdentifier=iclouddrive&reqIdentifier=9d4788f6-fc48-47e1-8d38-13c46d8d85db&clientBuildNumber=2116Project37&clientMasteringNumber=2116B28&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e`,
        data: props.drivewsids.map(
            drivewsid => ({
                drivewsid,
                partialData: props.partialData,
                includeHierarchy: props.includeHierarchy
            })
        ),
    }
}

const applyHttpResponseToSession = createHttpResponseReducer(
    getResponse,
    (sess, resp) => reduceHttpResponseToSession(sess, resp.httpResponse)
)

export function retrieveItemDetailsInFolders(
    props: RetrieveOpts
): TE.TaskEither<
    UnexpectedResponse | FetchError | InvalidGlobalSessionResponse | ErrorReadingResponseBody | InvalidJsonInResponse,
    // readonly [ICloudSessionState, DriveItemDetailsResponse]
    { session: ICloudSessionState, response: DriveItemDetailsResponse }
> {
    return pipe(
        createHttpRequest(props),
        props.client,
        TE.chainW(applyHttpResponseToSession(props.validatedSession.session)),
        // TE.map(({ session, response }) => [session, response] as const)
    )
}
