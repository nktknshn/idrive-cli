import assert from 'assert'
import { isLeft, isRight } from 'fp-ts/lib/Either'
import { PathReporter } from 'io-ts/PathReporter'
import { appLibraryDetailsWithHierarchyPartial, driveDetailsWithHierarchyPartial } from '../src/icloud/drive/types-io'

const partial1 = {
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
}

describe('1', () => {
  it('2', () => {
    const res1 = appLibraryDetailsWithHierarchyPartial.decode(partial1)

    if (isLeft(res1)) {
      console.log(
        PathReporter.report(res1),
      )
    }

    assert.equal(
      isRight(res1),
      true,
    )
  })
})
