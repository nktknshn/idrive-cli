import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { FetchClientEither } from '../../../lib/http/fetch-client'
import { apiLogger } from '../../../lib/logging'
import { isObjectWithOwnProperty } from '../../../lib/util'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { buildRequest } from '../../session/session-http'
import * as ARR from './api-rte'
import { expectJson, ResponseWithSession } from './http'
import * as AR from './request'

export interface MoveItemToTrashResponse {
  items: { drivewsid: string }[]
}

export const moveItemsToTrashM = <S extends ICloudSessionValidated>({ items, trash = false }: {
  items: { drivewsid: string; etag: string }[]
  trash?: boolean
}): AR.AuthorizedRequest<MoveItemToTrashResponse, S> =>
  AR.basicDriveJsonRequest(
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
    v => t.type({ items: t.array(t.type({ drivewsid: t.string })) }).decode(v) as t.Validation<MoveItemToTrashResponse>,
  )

export const moveItemsToTrashARR = ({ items, trash = false }: {
  items: { drivewsid: string; etag: string }[]
  trash?: boolean
}): ARR.DriveApiRequest<MoveItemToTrashResponse> =>
  ARR.basicDriveJsonRequest(
    ({ accountData }) => ({
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
      t.type({
        items: t.array(t.type({ drivewsid: t.string })),
      }).decode(v) as t.Validation<MoveItemToTrashResponse>,
  )
