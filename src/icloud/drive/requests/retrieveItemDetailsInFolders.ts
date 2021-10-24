import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { FetchClientEither } from '../../../lib/fetch-client'
import { expectJson, ResponseParser, ResponseWithSession } from '../../../lib/response-reducer'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { buildRequest } from '../../session/session-http'
import { DriveDetails, DriveDetailsFolder, DriveDetailsPartialWithHierarchy } from '../types'

interface RetrieveOpts {
  drivewsids: string[]
  partialData: boolean
  includeHierarchy: boolean
}

function retrieveItemDetailsInFoldersGeneric<R>(
  client: FetchClientEither,
  { accountData, session }: ICloudSessionValidated,
  props: {
    drivewsid: string
    partialData: boolean
    includeHierarchy: boolean
  }[],
  app: ResponseParser<R>,
): TE.TaskEither<Error, ResponseWithSession<R>> {
  return pipe(
    session,
    buildRequest(
      'POST',
      `${accountData.webservices.drivews.url}/retrieveItemDetailsInFolders?dsid=${accountData.dsInfo.dsid}&appIdentifier=iclouddrive&reqIdentifier=9d4788f6-fc48-47e1-8d38-13c46d8d85db&clientBuildNumber=2116Project37&clientMasteringNumber=2116B28&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e`,
      {
        data: props,
      },
    ),
    client,
    app(session),
  )
}

const applyHttpResponseToSession: ResponseParser<DriveDetails[]> = expectJson((
  json: unknown,
): json is DriveDetails[] => Array.isArray(json))

export function retrieveItemDetailsInFolders(
  client: FetchClientEither,
  { accountData, session }: ICloudSessionValidated,
  props: RetrieveOpts,
): TE.TaskEither<Error, ResponseWithSession<DriveDetails[]>> {
  return retrieveItemDetailsInFoldersGeneric(
    client,
    { accountData, session },
    props.drivewsids.map((drivewsid) => ({
      drivewsid,
      partialData: props.partialData,
      includeHierarchy: props.includeHierarchy,
    })),
    applyHttpResponseToSession,
  )
}

const applyHttpResponseToSessionHierarchy = expectJson((
  json: unknown,
): json is DriveDetailsPartialWithHierarchy[] => Array.isArray(json))

export function retrieveHierarchy(
  client: FetchClientEither,
  { accountData, session }: ICloudSessionValidated,
  { drivewsids }: { drivewsids: string[] },
): TE.TaskEither<Error, ResponseWithSession<DriveDetailsPartialWithHierarchy[]>> {
  return retrieveItemDetailsInFoldersGeneric(
    client,
    { accountData, session },
    drivewsids.map((drivewsid) => ({
      drivewsid,
      partialData: true,
      includeHierarchy: true,
    })),
    applyHttpResponseToSessionHierarchy,
  )
}
