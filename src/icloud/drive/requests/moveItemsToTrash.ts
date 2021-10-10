import { pipe } from "fp-ts/lib/function";
import { FetchClientEither, HttpResponse } from "../../../lib/fetch-client";
import { ICloudSessionValidated } from "../../authorization/authorize";
import { getBasicRequest, reduceHttpResponseToSession } from "../../session/session-http";
import * as E from 'fp-ts/lib/Either'
import * as TE from 'fp-ts/lib/TaskEither'
import { createHttpResponseReducer, validateJsonAndApply } from "../../../lib/response-reducer";
import { DriveChildrenItemFolder, DriveDetailsFolder } from "../types";
import { isObjectWithOwnProperty } from "../../../lib/util";
import { InvalidJsonInResponse } from "../../../lib/json";
import { InvalidGlobalSessionResponse, UnexpectedResponse } from "../../../lib/errors";

interface Response {
    items: unknown[]
}

export function moveItemsToTrash(
    client: FetchClientEither,
    { session, accountData }: ICloudSessionValidated,
    { items, trash = false }: {
        items: { drivewsid: string, etag: string }[],
        trash?: boolean
    }
) {

    const validateResponseJson = (json: unknown): json is Response =>
        isObjectWithOwnProperty(json, 'items')

    const applyHttpResponseToSession = validateJsonAndApply(validateResponseJson)

    return pipe(
        session,
        getBasicRequest(
            'POST',
            `${accountData.webservices.drivews.url}/${trash ? 'moveItemsToTrash' : 'deleteItems'}?dsid=${accountData.dsInfo.dsid}&appIdentifier=iclouddrive&reqIdentifier=9d4788f6-fc48-47e1-8d38-13c46d8d85db&clientBuildNumber=2116Project37&clientMasteringNumber=2116B28&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e`,
            {
                items: items.map(
                    item => ({
                        drivewsid: item.drivewsid,
                        clientId: item.drivewsid,
                        etag: item.etag
                    }))
            }
        ),
        client,
        TE.chainW(applyHttpResponseToSession(session)),
    )
}
