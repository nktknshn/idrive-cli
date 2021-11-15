import { flow } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { FetchClientEither } from '../../../lib/fetch-client'
import { applyCookies, ResponseWithSession } from '../../../lib/response-reducer'
import { ICloudSessionValidated } from '../../authorization/authorize'
import { DriveDetailsPartialWithHierarchy } from '../types'
import { driveDetailsWithHierarchyPartial, hierarchy } from '../types-io'
import { applyToSession, decodeJson, filterStatus, withResponse } from './filterStatus'
import { retrieveItemDetailsInFoldersGeneric } from './retrieveItemDetailsInFolders'
/*
const retrieveHierarchy1 = {
  dateCreated: '2021-09-25T20:39:45Z',
  drivewsid: 'FOLDER::F3LWYJ7GM7.com.apple.mobilegarageband::documents',
  docwsid: 'documents',
  zone: 'F3LWYJ7GM7.com.apple.mobilegarageband',
  name: 'GarageBand for iOS',
  parentId: 'FOLDER::com.apple.CloudDocs::root',
  etag: '9',
  type: 'APP_LIBRARY',
  maxDepth: 'ANY',
  icons: [
    {
      url: 'https://p46-drivews.icloud.com/getIcons?id=F3LWYJ7GM7.com.apple.mobilegarageband&field=icon120x120_iOS',
      type: 'IOS',
      size: 120,
    },
    {
      url: 'https://p46-drivews.icloud.com/getIcons?id=F3LWYJ7GM7.com.apple.mobilegarageband&field=icon80x80_iOS',
      type: 'IOS',
      size: 80,
    },
    {
      url: 'https://p46-drivews.icloud.com/getIcons?id=F3LWYJ7GM7.com.apple.mobilegarageband&field=icon40x40_iOS',
      type: 'IOS',
      size: 40,
    },
  ],
  supportedExtensions: ['gbproj', 'band'],
  supportedTypes: ['com.apple.garageband.project'],
  items: [
    {
      drivewsid: 'FILE::F3LWYJ7GM7.com.apple.mobilegarageband::2FBEE2CE-8FCA-4397-A99A-8E7949162AAF',
      docwsid: '2FBEE2CE-8FCA-4397-A99A-8E7949162AAF',
      etag: '7::6',
    },
  ],
  numberOfItems: 1,
  status: 'OK',
  hierarchy: [{ drivewsid: 'FOLDER::com.apple.CloudDocs::root' }],
} */

// console.log(
//   hierarchy.decode([{ drivewsid: 'FOLDER::com.apple.CloudDocs::root' }]),
// )

export function retrieveHierarchy(
  client: FetchClientEither,
  { accountData, session }: ICloudSessionValidated,
  { drivewsids }: { drivewsids: string[] },
): TE.TaskEither<Error, ResponseWithSession<DriveDetailsPartialWithHierarchy[]>> {
  // console.log(
  //   hierarchy.decode([{ drivewsid: 'FOLDER::com.apple.CloudDocs::root' }]),
  // )

  throw new Error()
  const res = retrieveItemDetailsInFoldersGeneric(
    client,
    { accountData, session },
    drivewsids.map(drivewsid => ({ drivewsid, partialData: true, includeHierarchy: true })),
    session =>
      TE.chain(
        flow(
          withResponse,
          filterStatus(),
          decodeJson(v => t.array(driveDetailsWithHierarchyPartial).decode(v)),
          applyToSession(({ httpResponse }) => applyCookies(httpResponse)(session)),
        ),
      ),
  )

  return res
}
