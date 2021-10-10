import { pipe } from "fp-ts/lib/function"
import * as TE from 'fp-ts/lib/TaskEither'
import { Readable } from "stream"
import { error } from "../../../lib/errors"
import { expectResponse, FetchClientEither } from "../../../lib/fetch-client"
import { ResponseWithSession, validateJsonAndApply } from "../../../lib/response-reducer"
import { isObjectWithOwnProperty } from "../../../lib/util"
import { ICloudSessionValidated } from "../../authorization/authorize"
import { getBasicRequest } from "../../session/session-http"

type RetrieveOpts = {

    documentId: string,
    zone: string,

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

export function download(
    client: FetchClientEither,
    { session, accountData }: ICloudSessionValidated,
    { documentId, zone }: RetrieveOpts
): TE.TaskEither<Error, ResponseWithSession<ResponseBodySafe>> {

    const validateBody = (json: unknown): json is ResponseBodySafe =>
        isObjectWithOwnProperty(json, "data_token") && isObjectWithOwnProperty(json.data_token, "url")

    const applyHttpResponseToSession = validateJsonAndApply(validateBody)

    return pipe(
        session,
        getBasicRequest('GET',
            `${accountData.webservices.docws.url}/ws/${zone}/download/by_id?document_id=${documentId}&dsid=${accountData.dsInfo.dsid}`),
        client,
        TE.chainW(applyHttpResponseToSession(session))
    )
}

export function getUrlStream({
    client, url
}: { client: FetchClientEither, url: string }) {
    return pipe(
        client({ method: 'GET', url, headers: {}, data: undefined, responseType: 'stream' }),
        expectResponse(_ => _.status == 200, _ => error(`responded ${_.status}`)),
        TE.map(_ => _.data as Readable)
    )
}

export function consumeStream(readable: Readable) {
    // readable.setEncoding('utf8');
    return TE.fromTask<string, Error>(async () => {
        let data = '';
        for await (const chunk of readable) {
            data += chunk;
        }
        return data
    })
}