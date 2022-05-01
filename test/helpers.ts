import { T } from '../src/icloud/drive/'
import { parseDrivewsid } from '../src/icloud/drive/util/drive-helpers'

export const detailsFolder = (
  data: Partial<T.DetailsFolder> & {
    drivewsid: `FOLDER::${string}::${string}`
    name: string
    parentId: `FOLDER::${string}::${string}`
  },
  items: T.DriveChildrenItem[] = [],
): T.DetailsFolder => ({
  'dateCreated': '2022-02-18T13:49:00Z',
  // 'drivewsid': 'FOLDER::iCloud.md.obsidian::3845A1B5-B400-48C0-A95F-3EA69BD005D1',
  'docwsid': parseDrivewsid(data.drivewsid).docwsid,
  'zone': parseDrivewsid(data.drivewsid).zone,
  // 'name': 'screen',
  // 'parentId': 'FOLDER::iCloud.md.obsidian::50EFD618-4D77-48B0-B260-63E3985E242F',
  'etag': '1pt',
  'type': 'FOLDER',
  'assetQuota': 14710,
  'fileCount': 2,
  'shareCount': 0,
  'shareAliasCount': 0,
  'directChildrenCount': 2,
  'items': [],
  // 'items': [
  //   {
  //     'dateCreated': '2021-09-12T10:26:43Z',
  //     'drivewsid': 'FILE::iCloud.md.obsidian::7B1CA7C5-690C-4C2A-8080-49309681C380',
  //     'docwsid': '7B1CA7C5-690C-4C2A-8080-49309681C380',
  //     'zone': 'iCloud.md.obsidian',
  //     'name': 'cheatsheet',
  //     'extension': 'md',
  //     'parentId': 'FOLDER::iCloud.md.obsidian::3845A1B5-B400-48C0-A95F-3EA69BD005D1',
  //     'dateModified': '2021-09-13T11:07:10Z',
  //     'dateChanged': '2022-02-18T13:49:09Z',
  //     'size': 3999,
  //     'etag': '1ll::1lk',
  //     'type': 'FILE',
  //   },
  //   {
  //     'dateCreated': '2021-09-12T10:26:43Z',
  //     'drivewsid': 'FILE::iCloud.md.obsidian::4BCD5AC2-B0DE-41D5-8CF1-06153463AD32',
  //     'docwsid': '4BCD5AC2-B0DE-41D5-8CF1-06153463AD32',
  //     'zone': 'iCloud.md.obsidian',
  //     'name': 'screenrc',
  //     'extension': 'md',
  //     'parentId': 'FOLDER::iCloud.md.obsidian::3845A1B5-B400-48C0-A95F-3EA69BD005D1',
  //     'dateModified': '2021-09-12T10:26:43Z',
  //     'dateChanged': '2022-02-18T13:49:09Z',
  //     'size': 10711,
  //     'etag': '1ld::1lc',
  //     'type': 'FILE',
  //   },
  // ],
  'numberOfItems': 2,
  'status': 'OK',
  ...data,
})
