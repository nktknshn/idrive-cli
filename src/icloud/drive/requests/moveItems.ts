import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { FetchClientEither } from '../../../lib/fetch-client'
import { expectJson, ResponseWithSession } from '../../../lib/response-reducer'
import { isObjectWithOwnProperty } from '../../../lib/util'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { buildRequest } from '../../session/session-http'
import { DriveChildrenItem, DriveChildrenItemFile } from '../types'

// POST https://p46-drivews.icloud.com/moveItems?appIdentifier=iclouddrive&reqIdentifier=e94318c1-3c8c-4261-8daa-ad8ef8ba308a&clientBuildNumber=2201Project38&clientMasteringNumber=2201B34&clientId=ab65f63a-3fa9-4c37-908d-4de557ad6afe&dsid=20322967922

// {"destinationDrivewsId":"FOLDER::com.apple.CloudDocs::8C4A4E75-779B-4CF4-9C17-FD6130DA7341","items":[{"drivewsid":"FILE::com.apple.CloudDocs::5B1F269B-7E76-4578-9222-FDE1A8DDA288","etag":"a2::a7","clientId":"FILE::7526db80-ef53-40a7-9056-8ed0bb0eb6f3::7526db80-ef53-40a7-9056-8ed0bb0eb6f3"}]}

// {"items":[{"dateCreated":"2021-11-03T08:28:52Z","drivewsid":"FILE::com.apple.CloudDocs::5B1F269B-7E76-4578-9222-FDE1A8DDA288","docwsid":"5B1F269B-7E76-4578-9222-FDE1A8DDA288","zone":"com.apple.CloudDocs","name":"yarn-error","extension":"log","parentId":"FOLDER::com.apple.CloudDocs::8C4A4E75-779B-4CF4-9C17-FD6130DA7341","isChainedToParent":true,"dateModified":"2021-10-10T15:49:51Z","dateChanged":"2021-11-03T08:29:10Z","size":231265,"etag":"aa::a7","shortGUID":"0cMrs8QS3bEsWhJA9umk4mLzQ","type":"FILE","clientId":"FILE::7526db80-ef53-40a7-9056-8ed0bb0eb6f3::7526db80-ef53-40a7-9056-8ed0bb0eb6f3","status":"OK"}]}

export interface MoveItemToTrashResponse {
  items: DriveChildrenItem[]
}

export function moveItems(
  client: FetchClientEither,
  { session, accountData }: ICloudSessionValidated,
  { items }: {
    destinationDrivewsId: string
    items: { drivewsid: string; etag: string }[]
  },
): TE.TaskEither<Error, ResponseWithSession<MoveItemToTrashResponse>> {
  const applyHttpResponseToSession = expectJson(
    (json: unknown): json is MoveItemToTrashResponse => isObjectWithOwnProperty(json, 'items'),
  )

  return pipe(
    session,
    buildRequest(
      'POST',
      `${accountData.webservices.drivews.url}/moveItems?dsid=${accountData.dsInfo.dsid}&appIdentifier=iclouddrive&reqIdentifier=9d4788f6-fc48-47e1-8d38-13c46d8d85db&clientBuildNumber=2116Project37&clientMasteringNumber=2116B28&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e`,
      {
        data: {
          items: items.map((item) => ({
            drivewsid: item.drivewsid,
            clientId: item.drivewsid,
            etag: item.etag,
          })),
        },
      },
    ),
    client,
    applyHttpResponseToSession(session),
  )
}
