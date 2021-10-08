import assert from "assert"
import { pipe } from "fp-ts/lib/function"
import * as TE from 'fp-ts/lib/TaskEither'
import { Readable } from "stream"
import { basicGetResponse, createHttpResponseReducer } from "../../../lib/createHttpResponseReducer"
import { FetchClientEither, HttpRequest, HttpResponse } from "../../../lib/fetch-client"
import { buildRecord, isObjectWithOwnProperty } from "../../../lib/util"
import { AccountLoginResponseBody } from "../../authorization/accoutLoginResponseType"
import { ICloudSessionState } from "../../session/session"
import { reduceHttpResponseToSession } from "../../session/session-http"
import { basicHeaders, getSessionCookiesHeaders } from "../../session/session-http-headers"

type RetrieveOpts = {
    validatedSession: {
        session: ICloudSessionState,
        accountData: AccountLoginResponseBody
    },
    documentId: string,
    zone: string,
    client: FetchClientEither,
}

// interface RetrieveOpts {
//     validatedSession: {
//         session: ICloudSessionState,
//         accountData: AccountLoginResponseBody
//     },
//     documentId: string,
//     zone: string,
//     client: FetchClientEither,
// }

export interface DriveDownloadResponse {
    httpResponse: HttpResponse;
    body: ResponseBodySafe
}

export interface DriveDownloadNotFound {
    httpResponse: HttpResponse;
    json: unknown
}

interface ResponseBody {
    "document_id": string,
    "owner_dsid": number,
    "data_token": {
        "url": string,
        "token": string,
        "signature": string,
        "wrapping_key": string,
        "reference_signature": string
    },
    "double_etag": string
}

interface ResponseBodySafe {
    "data_token": {
        "url": string,
    },
}

const validateBody = (json: unknown): json is ResponseBodySafe =>
    isObjectWithOwnProperty(json, "data_token") && isObjectWithOwnProperty(json.data_token, "url")
/* 
function getResponse(
    httpResponse: HttpResponse,
    json: E.Either<Error, unknown>
): E.Either<Error, DriveDownloadResponse> {
    if (httpResponse.status == 200) {
        if (E.isRight(json)) {
            if (validateBody(json.right)) {
                return E.right({
                    httpResponse,
                    body: json.right,
                })
            }
            else {
                return E.left(error(`invalid response json: ${JSON.stringify(json.right)}`))
            }
        }
        else {
            return E.left(error(`missing json response`))
        }
    }
    else if (httpResponse.status == 421) {
        return E.left(new InvalidGlobalSessionResponse(httpResponse))
    }

    return E.left(error(`Wrong response: ${httpResponse.status} json body: ${json}`))
} */

function createHttpRequest({
    zone, documentId, validatedSession: { accountData, session }
}: RetrieveOpts) {
    assert(accountData.webservices.docws.url)

    return new HttpRequest(
        `${accountData.webservices.docws.url}/ws/${zone}/download/by_id?document_id=${documentId}&dsid=${accountData.dsInfo.dsid}`,
        {
            method: 'GET',
            headers: buildRecord([
                ...basicHeaders,
                ...getSessionCookiesHeaders(
                    session
                )]),
        })
}

const applyHttpResponseToSession = createHttpResponseReducer(
    basicGetResponse(validateBody),
    (sess, resp) => reduceHttpResponseToSession(sess, resp.httpResponse)
)

type EndpointResponse = readonly [ICloudSessionState, DriveDownloadResponse]

export function download(
    props: RetrieveOpts
) {
    return pipe(
        createHttpRequest(props),
        props.client,
        TE.chainW(applyHttpResponseToSession(props.validatedSession.session))
    )
    // return props.client(createHttpRequest(props))
    //     .flatMapE(applyHttpResponseToSession(props.session))
    //     .map(({ session, response }) => [session, response] as const)
}


export function getUrlStream({
    client, url
}: { client: FetchClientEither, url: string }) {
    return pipe(
        client({
            method: 'GET',
            url,
            headers: {},
            data: undefined,
            responseType: 'stream'
        }),
        TE.map(_ => {
            return _.data as Readable
        })
    )
}

// async function main( ) {
//     const res = await pipe(
//         getUrlArrayBuffer({
//             client: fetchClient,
//             url: 'https://sourceforge.net/p/workrave/mailman/attachment/4E2372E1.90801%40gmail.com/2/'
//         }),

//     )()

//     logger.info(
//         res
//     )
// }

// main()