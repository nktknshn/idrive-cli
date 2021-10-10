import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { FetchClientEither } from '../../../lib/fetch-client'
import { ResponseWithSession, validateJsonAndApply } from '../../../lib/response-reducer'
import { ICloudSessionValidated } from "../../authorization/authorize"
import { getBasicRequest } from '../../session/session-http'
import { DriveDetailsFolder } from '../types'


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
            {
                data: props.drivewsids.map(
                    drivewsid => ({
                        drivewsid,
                        partialData: props.partialData,
                        includeHierarchy: props.includeHierarchy
                    })
                )
            }
        ),
        client,
        TE.chainW(applyHttpResponseToSession(session)),
    )
}
