import assert from "assert"
import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { basicGetResponse, createHttpResponseReducer } from '../../../lib/createHttpResponseReducer'
import { FetchClientEither, HttpRequest, HttpResponse } from '../../../lib/fetch-client'
import { buildRecord } from '../../../lib/util'
import { AccountLoginResponseBody } from '../../authorization/accoutLoginResponseType'
import { ICloudSessionState } from '../../session/session'
import { reduceHttpResponseToSession } from '../../session/session-http'
import { basicHeaders, getSessionCookiesHeaders } from '../../session/session-http-headers'
import { DriveDetailsFolder } from '../types'

// https://p46-drivews.icloud.com/retrieveItemDetails


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
    body: DriveDetailsFolder[];
}

const validateJson = (json: unknown): json is DriveDetailsFolder[] => Array.isArray(json)
/* 
function getResponse(
    httpResponse: HttpResponse,
    json: E.Either<unknown, unknown>
): E.Either<UnexpectedResponse | InvalidGlobalSessionResponse, DriveItemDetailsResponse> {
    if (httpResponse.status == 200 && E.isRight(json)) {
        return E.right({
            httpResponse,
            response: json.right
        })
    }
    else if (httpResponse.status == 421) {
        return E.left(new InvalidGlobalSessionResponse(httpResponse))
    }

    return E.left(new UnexpectedResponse(httpResponse, json))
}
 */
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
    basicGetResponse(validateJson),
    (sess, resp) => reduceHttpResponseToSession(sess, resp.httpResponse)
)

export function retrieveItemDetailsInFolders(
    props: RetrieveOpts
): TE.TaskEither<Error,
    { session: ICloudSessionState, response: DriveItemDetailsResponse }
> {
    return pipe(
        createHttpRequest(props),
        props.client,
        TE.chainW(applyHttpResponseToSession(props.validatedSession.session)),
        // TE.map(({ session, response }) => [session, response] as const)
    )
}
