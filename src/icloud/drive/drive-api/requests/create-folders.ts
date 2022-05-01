import { pipe } from 'fp-ts/lib/function'
import * as t from 'io-ts'
import * as AR from '../../../request'
import { itemFolder } from '../../icloud-drive-types/types-io'

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

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface CreateFoldersResponse extends t.TypeOf<typeof createFolderResponse> {}

export function createFoldersM<S extends AR.AuthorizedState>(
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
