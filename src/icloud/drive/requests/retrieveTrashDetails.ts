import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as t from 'io-ts'
import { DetailsTrashRoot, DriveChildrenItem } from '../types'
import { detailsItem, detailsTrash } from '../types/types-io'
import { AuthorizedState } from './request'
import * as AR from './request'
import { getRetrieveItemDetailsInFoldersHttpRequest } from './retrieveItemDetailsInFolders'

export const scheme = t.tuple(
  [detailsTrash],
)

export interface RetrieveTrashDetailsResponse extends t.TypeOf<typeof scheme> {
}

export const retrieveTrashDetails = (): AR.AuthorizedRequest<DetailsTrashRoot> =>
  pipe(
    getRetrieveItemDetailsInFoldersHttpRequest(
      [{ 'drivewsid': 'TRASH_ROOT', 'partialData': false, 'includeHierarchy': true }],
    ),
    AR.handleResponse(AR.basicJsonResponse(
      flow(scheme.decode, E.map(_ => _[0])),
    )),
  )

export const putBackItemsFromTrash = <S extends AuthorizedState>(
  items: [{ drivewsid: string; etag: string }],
): AR.AuthorizedRequest<{ items: DriveChildrenItem[] }, S> =>
  AR.basicDriveJsonRequest(
    ({ state: { accountData } }) => ({
      method: 'POST',
      url: `${accountData.webservices.drivews.url}/putBackItemsFromTrash?dsid=${accountData.dsInfo.dsid}`,

      options: { addClientInfo: true, data: { items } },
    }),
    t.type({ items: t.array(detailsItem) }).decode,
  )
