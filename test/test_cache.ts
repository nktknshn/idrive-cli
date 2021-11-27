import { pipe } from 'fp-ts/lib/function'
import * as C from '../src/icloud/drive/cache/cachef'

import { DriveChildrenItem, DriveDetails, DriveDetailsFolder, DriveDetailsRoot } from '../src/icloud/drive/types'
import { logger } from '../src/lib/logging'
// import { DriveItemFolderDetails } from '../src/icloud/drive/driveResponseType'
import * as E from 'fp-ts/lib/Either'

const createFolderDetails = (
  opts: {
    name: string
    parentId: string
    drivewsid: string
    docwsid: string
    etag?: string
    zone?: string
    items?: DriveChildrenItem[]
  },
): DriveDetailsFolder => ({
  'dateCreated': '2021-09-11T19:46:45Z',
  'drivewsid': opts.drivewsid,
  'docwsid': opts.docwsid,
  'zone': opts.zone ?? 'com.apple.CloudDocs',
  'name': opts.name,
  'parentId': opts.parentId,
  'isChainedToParent': true,
  'etag': opts.etag ?? 'etag0',
  'type': 'FOLDER',
  'assetQuota': 13567,
  'fileCount': 9,
  'shareCount': 0,
  'shareAliasCount': 0,
  'directChildrenCount': 5,
  'items': opts.items ?? [],
  'numberOfItems': 5,
  'status': 'OK',
})

const createRootDetails = ({
  etag = 'rootetag0',
  items = [],
} = {}): DriveDetailsRoot => ({
  'dateCreated': '2021-07-26T19:34:15Z',
  'drivewsid': 'FOLDER::com.apple.CloudDocs::root',
  'docwsid': 'root',
  'zone': 'com.apple.CloudDocs',
  'name': '',
  'etag': etag,
  'type': 'FOLDER',
  'assetQuota': 264525,
  'fileCount': 16,
  'shareCount': 0,
  'shareAliasCount': 0,
  'directChildrenCount': 7,
  'items': [],
  'numberOfItems': items.length,
  'status': 'OK',
})

const root = () => {
}

describe('drive-cache', () => {
  it('1', () => {
    const cache = C.Cache.create()

    logger.info(
      pipe(
        cache.putRoot(createRootDetails()),
      ),
    )
  })
})
