import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as t from 'io-ts'
import { AuthenticatedState } from '../../icloud-core/icloud-request/lib/request'
import * as AR from '../../icloud-core/icloud-request/lib/request'
import { debugTimeSRTE } from '../../logging/debug-time'
import { DetailsTrashRoot, DriveChildrenItem } from '../drive-types'
import { detailsItem, detailsTrash } from '../drive-types/types-io'
import { getRetrieveItemDetailsInFoldersHttpRequest } from './retrieveItemDetailsInFolders'

export const scheme = t.tuple(
  [detailsTrash],
)

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RetrieveTrashDetailsResponse extends t.TypeOf<typeof scheme> {
}

export const retrieveTrashDetails = <S extends AuthenticatedState>(): AR.ApiRequest<DetailsTrashRoot, S> =>
  pipe(
    getRetrieveItemDetailsInFoldersHttpRequest<S>(
      [{ 'drivewsid': 'TRASH_ROOT', 'partialData': false, 'includeHierarchy': true }],
    ),
    AR.handleResponse(AR.basicJsonResponse(
      flow(scheme.decode, E.map(_ => _[0])),
    )),
    debugTimeSRTE('retrieveTrashDetails'),
  )

export const putBackItemsFromTrash = <S extends AuthenticatedState>(
  items: [{ drivewsid: string; etag: string }],
): AR.ApiRequest<{ items: DriveChildrenItem[] }, S> =>
  AR.basicJsonRequest(
    ({ state: { accountData } }) => ({
      method: 'POST',
      url: `${accountData.webservices.drivews.url}/putBackItemsFromTrash?dsid=${accountData.dsInfo.dsid}`,

      options: { addClientInfo: true, data: { items } },
    }),
    t.type({ items: t.array(detailsItem) }).decode,
  )
