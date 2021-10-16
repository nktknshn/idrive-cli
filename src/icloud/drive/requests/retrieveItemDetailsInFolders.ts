import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { FetchClientEither } from '../../../lib/fetch-client'
import { expectJson, ResponseWithSession } from '../../../lib/response-reducer'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { buildRequest } from '../../session/session-http'
import { DriveDetails, DriveDetailsFolder } from '../types'

interface RetrieveOpts {
  drivewsids: string[]
  partialData: boolean
  includeHierarchy: boolean
}

export function retrieveItemDetailsInFolders(
  client: FetchClientEither,
  { accountData, session }: ICloudSessionValidated,
  props: RetrieveOpts,
): TE.TaskEither<Error, ResponseWithSession<DriveDetails[]>> {
  const applyHttpResponseToSession = expectJson((json: unknown): json is DriveDetailsFolder[] => Array.isArray(json))

  return pipe(
    session,
    buildRequest(
      'POST',
      `${accountData.webservices.drivews.url}/retrieveItemDetailsInFolders?dsid=${accountData.dsInfo.dsid}&appIdentifier=iclouddrive&reqIdentifier=9d4788f6-fc48-47e1-8d38-13c46d8d85db&clientBuildNumber=2116Project37&clientMasteringNumber=2116B28&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e`,
      {
        data: props.drivewsids.map((drivewsid) => ({
          drivewsid,
          partialData: props.partialData,
          includeHierarchy: props.includeHierarchy,
        })),
      },
    ),
    client,
    applyHttpResponseToSession(session),
  )
}
