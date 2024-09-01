import * as t from 'io-ts'
import * as AR from '../../icloud-core/icloud-request'
import { AuthenticatedState } from '../../icloud-core/icloud-request'
import { logAPI } from '../../icloud-core/icloud-request/log'

export interface MoveItemToTrashResponse {
  items: { drivewsid: string }[]
}

export const moveItemsToTrash = <S extends AuthenticatedState>({ items, trash = false }: {
  items: { drivewsid: string; etag: string }[]
  trash?: boolean
}): AR.ApiRequest<MoveItemToTrashResponse, S> =>
  logAPI('moveItemsToTrash')(
    AR.basicJsonRequest(
      ({ state: { accountData } }) => ({
        method: 'POST',
        url: `${accountData.webservices.drivews.url}/${
          trash ? 'moveItemsToTrash' : 'deleteItems'
        }?dsid=${accountData.dsInfo.dsid}`,
        options: {
          addClientInfo: true,
          data: {
            items: items.map((item) => ({
              drivewsid: item.drivewsid,
              clientId: item.drivewsid,
              etag: item.etag,
            })),
          },
        },
      }),
      v =>
        t.type({ items: t.array(t.type({ drivewsid: t.string })) }).decode(v) as t.Validation<
          MoveItemToTrashResponse
        >,
    ),
  )
