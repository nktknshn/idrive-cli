import { pipe } from 'fp-ts/lib/function'
import * as t from 'io-ts'
import * as AR from '../../icloud-core/icloud-request'
import { logAPI } from '../../icloud-core/icloud-request/log'
import { itemFolder } from '../drive-types/types-io'

const createFolderResponse = t.type({
  destinationDrivewsId: t.string,
  folders: t.array(t.union([
    itemFolder,
    t.type({
      status: t.literal('UNKNOWN'),
      clientId: t.string,
    }),
  ])),
})

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface CreateFoldersResponse extends t.TypeOf<typeof createFolderResponse> {}

export function createFolders<S extends AR.AuthenticatedState>(
  { names, destinationDrivewsId }: {
    destinationDrivewsId: string
    names: string[]
  },
): AR.ApiRequest<CreateFoldersResponse, S> {
  const folders = names.map(name => ({ name, clientId: name }))

  return pipe(
    AR.buildRequest<S>(({ state }) => ({
      method: 'POST',
      url: `${state.accountData.webservices.drivews.url}/createFolders?dsid=${state.accountData.dsInfo.dsid}`,
      options: { addClientInfo: true, data: { destinationDrivewsId, folders } },
    })),
    AR.handleResponse(
      AR.basicJsonResponse(createFolderResponse.decode),
    ),
    logAPI('createFolders'),
  )
}
