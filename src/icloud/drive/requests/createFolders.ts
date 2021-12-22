import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { FetchClientEither } from '../../../lib/http/fetch-client'
import { apiLogger, logf } from '../../../lib/logging'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { buildRequest } from '../../session/session-http'
import { expectJson, ResponseWithSession } from './filterStatus'
import { itemFolder } from './types/types-io'

const createFolderResponse = t.type({
  destinationDrivewsId: t.string,
  folders: t.array(itemFolder),
})

export interface CreateFoldersResponse extends t.TypeOf<typeof createFolderResponse> {}

export function createFolders(
  client: FetchClientEither,
  { accountData, session }: ICloudSessionValidated,
  { names, destinationDrivewsId }: { destinationDrivewsId: string; names: string[] },
): TE.TaskEither<Error, ResponseWithSession<CreateFoldersResponse>> {
  return pipe(
    session,
    logf(`createFolders: ${names} in ${destinationDrivewsId}`, apiLogger.debug),
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
    expectJson(createFolderResponse.decode)(session),
  )
}
