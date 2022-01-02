import { apply, flow, pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Reader'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { FetchClientEither, HttpRequest, HttpResponse } from '../../../lib/http/fetch-client'
import { apiLogger, logf } from '../../../lib/logging'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { AccountLoginResponseBody } from '../../authorization/types'
import { ICloudSession } from '../../session/session'
import { apiHttpRequest, applyCookiesToSession, buildRequest } from '../../session/session-http'
import {
  applyToSession,
  applyToSession2,
  decodeJson,
  expectJson,
  filterStatus,
  ResponseWithSession,
  withResponse,
  withResponse2,
} from './http'
import * as AR from './reader'
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
      `${accountData.webservices.drivews.url}/createFolders?dsid=${accountData.dsInfo.dsid}`,
      {
        addClientInfo: true,
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

export function createFoldersM(
  { names, destinationDrivewsId }: {
    destinationDrivewsId: string
    names: string[]
  },
): AR.DriveApiRequest<CreateFoldersResponse> {
  const folders = names.map(name => ({ name, clientId: name }))

  return pipe(
    AR.buildRequestC<ICloudSessionValidated>(({ state }) => ({
      method: 'POST',
      url: `${state.accountData.webservices.drivews.url}/createFolders?dsid=${state.accountData.dsInfo.dsid}`,
      options: { addClientInfo: true, data: { destinationDrivewsId, folders } },
    })),
    AR.handleResponse(
      AR.basicJsonResponse(createFolderResponse.decode),
    ),
  )
}
