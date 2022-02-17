import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { FetchClientEither } from '../../../lib/http/fetch-client'
import { apiLogger } from '../../../lib/logging'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { applyCookiesToSession, buildRequest } from '../../session/session-http'
import { applyToSession, decodeJson, expectJson, filterStatus, ResponseWithSession, withResponse } from './http'
import * as AR from './request'
import {
  getRetrieveItemDetailsInFoldersHttpRequest,
  retrieveItemDetailsInFoldersGeneric,
  retrieveItemDetailsInFoldersRequestARR,
} from './retrieveItemDetailsInFolders'
import { DetailsTrash, DriveChildrenItem } from './types/types'
import { detailsItem, detailsTrash } from './types/types-io'

export const scheme = t.tuple(
  [detailsTrash],
)

export interface RetrieveTrashDetailsResponse extends t.TypeOf<typeof scheme> {
}

export const retrieveTrashDetailsM = (): AR.AuthorizedRequest<DetailsTrash> =>
  pipe(
    getRetrieveItemDetailsInFoldersHttpRequest(
      [{ 'drivewsid': 'TRASH_ROOT', 'partialData': false, 'includeHierarchy': true }],
    ),
    AR.handleResponse(AR.basicJsonResponse(
      flow(scheme.decode, E.map(_ => _[0])),
    )),
  )

export const putBackItemsFromTrashM = (
  items: [{ drivewsid: string; etag: string }],
): AR.AuthorizedRequest<{ items: DriveChildrenItem[] }> =>
  AR.basicDriveJsonRequest(
    ({ state: { accountData } }) => ({
      method: 'POST',
      url: `${accountData.webservices.drivews.url}/putBackItemsFromTrash?dsid=${accountData.dsInfo.dsid}`,

      options: { addClientInfo: true, data: { items } },
    }),
    t.type({ items: t.array(detailsItem) }).decode,
  )

import * as ARR from './api-rte'

export const putBackItemsFromTrashARR = (
  items: [{ drivewsid: string; etag: string }],
): ARR.DriveApiRequest<{ items: DriveChildrenItem[] }> =>
  ARR.basicDriveJsonRequest(
    ({ accountData }) => ({
      method: 'POST',
      url: `${accountData.webservices.drivews.url}/putBackItemsFromTrash?dsid=${accountData.dsInfo.dsid}`,

      options: { addClientInfo: true, data: { items } },
    }),
    t.type({ items: t.array(detailsItem) }).decode,
  )

export const retrieveTrashDetailsARR = (): ARR.DriveApiRequest<DetailsTrash> =>
  pipe(
    retrieveItemDetailsInFoldersRequestARR(
      [{ 'drivewsid': 'TRASH_ROOT', 'partialData': false, 'includeHierarchy': true }],
    ),
    ARR.handleResponse(ARR.basicJsonResponse(
      flow(scheme.decode, E.map(_ => _[0])),
    )),
  )
