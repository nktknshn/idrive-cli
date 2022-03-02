import { pipe } from 'fp-ts/lib/function'
import * as t from 'io-ts'
import { AuthorizedState } from '../../authorization/authorize'
import * as ARR from './api-rte'
import * as AR from './request'
import { itemFolder } from './types/types-io'

const createFolderResponse = t.type({
  destinationDrivewsId: t.string,
  folders: t.array(itemFolder),
})

export interface CreateFoldersResponse extends t.TypeOf<typeof createFolderResponse> {}

export function createFoldersM<S extends AuthorizedState>(
  { names, destinationDrivewsId }: {
    destinationDrivewsId: string
    names: string[]
  },
): AR.AuthorizedRequest<CreateFoldersResponse, S> {
  const folders = names.map(name => ({ name, clientId: name }))

  return pipe(
    AR.buildRequestC<S>(({ state }) => ({
      method: 'POST',
      url: `${state.accountData.webservices.drivews.url}/createFolders?dsid=${state.accountData.dsInfo.dsid}`,
      options: { addClientInfo: true, data: { destinationDrivewsId, folders } },
    })),
    AR.handleResponse(
      AR.basicJsonResponse(createFolderResponse.decode),
    ),
  )
}

export function createFoldersARR(
  { names, destinationDrivewsId }: {
    destinationDrivewsId: string
    names: string[]
  },
): ARR.DriveApiRequest<CreateFoldersResponse> {
  const folders = names.map(name => ({ name, clientId: name }))

  return pipe(
    ARR.buildRequestC(({ accountData }) => ({
      method: 'POST',
      url: `${accountData.webservices.drivews.url}/createFolders?dsid=${accountData.dsInfo.dsid}`,
      options: { addClientInfo: true, data: { destinationDrivewsId, folders } },
    })),
    ARR.handleResponse(
      ARR.basicJsonResponse(createFolderResponse.decode),
    ),
  )
}
