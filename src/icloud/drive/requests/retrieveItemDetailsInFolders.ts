import assert from "assert"
import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { basicGetResponse, createHttpResponseReducer, ResponseWithSession, validateJsonAndApply } from '../../../lib/response-reducer'
import { FetchClientEither, HttpRequest, HttpResponse } from '../../../lib/fetch-client'
import { buildRecord } from '../../../lib/util'
import { AccountLoginResponseBody } from '../../authorization/accoutLoginResponseType'
import { ICloudSessionState } from '../../session/session'
import { getBasicRequest, reduceHttpResponseToSession } from '../../session/session-http'
import { basicHeaders, getSessionCookiesHeaders } from '../../session/session-http-headers'
import { DriveDetailsFolder } from '../types'
import { ICloudSessionValidated } from "../../authorization/authorize"


interface RetrieveOpts {
    drivewsids: string[]
    partialData: boolean,
    includeHierarchy: boolean
}

export function retrieveItemDetailsInFolders(
    client: FetchClientEither,
    { accountData, session }: ICloudSessionValidated,
    props: RetrieveOpts
): TE.TaskEither<Error,
    ResponseWithSession<DriveDetailsFolder[]>
> {
    const validateJson = (json: unknown): json is DriveDetailsFolder[] => Array.isArray(json)
    const applyHttpResponseToSession = validateJsonAndApply(validateJson)

    return pipe(
        session,
        getBasicRequest(
            'POST',
            `${accountData.webservices.drivews.url}/retrieveItemDetailsInFolders?dsid=${accountData.dsInfo.dsid}&appIdentifier=iclouddrive&reqIdentifier=9d4788f6-fc48-47e1-8d38-13c46d8d85db&clientBuildNumber=2116Project37&clientMasteringNumber=2116B28&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e`,
            props.drivewsids.map(
                drivewsid => ({
                    drivewsid,
                    partialData: props.partialData,
                    includeHierarchy: props.includeHierarchy
                })
            )),
        client,
        TE.chainW(applyHttpResponseToSession(session)),
    )
}
