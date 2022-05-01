import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as t from 'io-ts'
import { AuthorizedState } from '../../request/request'
import * as AR from '../../request/request'
import { DetailsTrashRoot, DriveChildrenItem } from '../icloud-drive-items-types'
import { detailsItem, detailsTrash } from '../icloud-drive-items-types/types-io'
import { getRetrieveItemDetailsInFoldersHttpRequest } from './retrieveItemDetailsInFolders'

export const scheme = t.tuple(
  [detailsTrash],
)

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface RetrieveTrashDetailsResponse extends t.TypeOf<typeof scheme> {
}

export const retrieveTrashDetails = <S extends AuthorizedState>(): AR.ApiRequest<DetailsTrashRoot, S> =>
  pipe(
    getRetrieveItemDetailsInFoldersHttpRequest<S>(
      [{ 'drivewsid': 'TRASH_ROOT', 'partialData': false, 'includeHierarchy': true }],
    ),
    AR.handleResponse(AR.basicJsonResponse(
      flow(scheme.decode, E.map(_ => _[0])),
    )),
  )

export const putBackItemsFromTrash = <S extends AuthorizedState>(
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
