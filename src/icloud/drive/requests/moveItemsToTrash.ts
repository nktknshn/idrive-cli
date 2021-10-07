import { pipe } from "fp-ts/lib/function";
import { FetchClientEither, HttpResponse } from "../../../lib/fetch-client";
import { ICloudSessionValidated } from "../../authorization/authorize";
import { getBasicRequest, reduceHttpResponseToSession } from "../../session/session-http";
import * as E from 'fp-ts/lib/Either'
import * as TE from 'fp-ts/lib/TaskEither'
import { createHttpResponseReducer } from "../../../lib/createHttpResponseReducer";
import { DriveChildrenItemFolder, DriveDetailsFolder } from "../types";
import { InvalidGlobalSessionResponse } from "./retrieveItemDetailsInFolders";
import { UnexpectedResponse } from "../../authorization/securitycode";
import { isObjectWithOwnProperty } from "../../../lib/util";
import { InvalidJsonInResponse } from "../../../lib/json";

interface Response {
    items: unknown[]
}

const validateResponseJson = (json: unknown): json is Response =>
    isObjectWithOwnProperty(json, 'items')

const applyHttpResponseToSession = createHttpResponseReducer(
    (httpResponse, json): E.Either<Error, { httpResponse: HttpResponse, response: Response }> => {
        if (
            httpResponse.status == 200 && E.isRight(json)
        ) {
            if (validateResponseJson(json.right)) {
                return E.right({
                    httpResponse,
                    response: json.right
                })
            }
            else {
                return E.left(new InvalidJsonInResponse(
                    httpResponse,
                    JSON.stringify(json.right))
                )
            }
        }
        else if (httpResponse.status == 421) {
            return E.left(new InvalidGlobalSessionResponse(httpResponse))
        }

        return E.left(new UnexpectedResponse(httpResponse, json))
    },
    (sess, resp) => reduceHttpResponseToSession(sess, resp.httpResponse)
)

export function moveItemsToTrash(
    { client, validatedSession: { session, accountData }, drivewsids }: {
        client: FetchClientEither,
        validatedSession: ICloudSessionValidated,
        drivewsids: string[]
    }
) {
    return pipe(
        session,
        getBasicRequest(
            'POST',
            `${accountData.webservices.drivews.url}/moveItemsToTrash?dsid=${accountData.dsInfo.dsid}&appIdentifier=iclouddrive&reqIdentifier=9d4788f6-fc48-47e1-8d38-13c46d8d85db&clientBuildNumber=2116Project37&clientMasteringNumber=2116B28&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e`,
            {
                items: drivewsids.map(
                    drivewsid => ({
                        drivewsid,
                        clientId: drivewsid
                    }))
            }
        ),
        client,
        TE.chainW(applyHttpResponseToSession(session)),
    )
}
