import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { FetchClientEither } from '../../../lib/fetch-client'
import { ResponseWithSession } from '../../../lib/response-reducer'
import { isObjectWithOwnProperty } from '../../../lib/util'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { buildRequest } from '../../session/session-http'
import { DriveChildrenItemFolder } from '../types'

import * as t from 'io-ts'
import { apiLogger, logf } from '../../../lib/logging'
import { childrenItem, itemFolder } from '../types-io'
import { expectJson } from './filterStatus'

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
