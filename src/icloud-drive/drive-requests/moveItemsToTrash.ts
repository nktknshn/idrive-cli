import { flow } from 'fp-ts/lib/function'
import * as t from 'io-ts'
import * as AR from '../../icloud-core/icloud-request/lib/request'
import { AuthenticatedState } from '../../icloud-core/icloud-request/lib/request'
import { debugTimeSRTE } from '../../logging/debug-time'
import { apiLoggerIO } from '../../logging/loggerIO'
import { runLogging } from '../../util/srte-utils'

export interface MoveItemToTrashResponse {
  items: { drivewsid: string }[]
}

export const moveItemsToTrash = <S extends AuthenticatedState>({ items, trash = false }: {
  items: { drivewsid: string; etag: string }[]
  trash?: boolean
}): AR.ApiRequest<MoveItemToTrashResponse, S> =>
  flow(
    debugTimeSRTE('moveItemsToTrash'),
    runLogging(apiLoggerIO.debug('moveItemsToTrash')),
  )(
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
