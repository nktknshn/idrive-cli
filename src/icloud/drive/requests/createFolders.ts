import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { FetchClientEither } from '../../../lib/fetch-client'
import { expectJson, ResponseWithSession } from '../../../lib/response-reducer'
import { isObjectWithOwnProperty } from '../../../lib/util'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { buildRequest } from '../../session/session-http'
import { DriveChildrenItemFolder } from '../types'

export interface CreateFoldersResponse {
  destinationDrivewsId: string
  folders: DriveChildrenItemFolder[]
}

export function createFolders(
  client: FetchClientEither,
  { accountData, session }: ICloudSessionValidated,
  { names, destinationDrivewsId }: { destinationDrivewsId: string; names: string[] },
): TE.TaskEither<Error, ResponseWithSession<CreateFoldersResponse>> {
  const applyHttpResponseToSession = expectJson(
    (json: unknown): json is CreateFoldersResponse =>
      isObjectWithOwnProperty(json, 'folders') && isObjectWithOwnProperty(json, 'destinationDrivewsId'),
  )

  return pipe(
    session,
    buildRequest(
      'POST',
      `${accountData.webservices.drivews.url}/createFolders?dsid=${accountData.dsInfo.dsid}&appIdentifier=iclouddrive&reqIdentifier=9d4788f6-fc48-47e1-8d38-13c46d8d85db&clientBuildNumber=2116Project37&clientMasteringNumber=2116B28&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e`,
      {
        data: {
          destinationDrivewsId,
          folders: names.map(name => ({ name, clientId: name })),
        },
      },
    ),
    client,
    applyHttpResponseToSession(session),
  )
}
