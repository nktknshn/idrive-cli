import assert from 'assert'
import * as E from 'fp-ts/Either'
import { apply, pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TR from 'fp-ts/lib/Tree'
import * as TE from 'fp-ts/TaskEither'
import * as C from '../src/icloud/drive/cache/cache'
import { DepApi } from '../src/icloud/drive/deps'
import { ApiType } from '../src/icloud/drive/deps/api-type'
import * as D from '../src/icloud/drive/drive'
import * as T from '../src/icloud/drive/types'

import { retrieveHierarchy } from '../src/icloud/drive/requests/retrieveHierarchy'
import { rootDrivewsid } from '../src/icloud/drive/types/types-io'
import { authorizedState, retrieveHierarchy1, validAccountdata } from './fixtures'
import { detailsFolder } from './helpers'

import { randomUUID } from 'crypto'
import * as A from 'fp-ts/Array'
import { randomRange } from 'fp-ts/lib/Random'
import * as NA from 'fp-ts/NonEmptyArray'
import * as O from 'fp-ts/Option'
import { type } from 'os'
import { parseFilename } from '../src/icloud/drive/helpers'
import { randomUUIDCap, recordFromTuples } from '../src/util/util'
import * as M from './mocked-client'

// const folder = ({}: {
//   name: string
//   parentId: `FOLDER::${string}::${string}`
// }, items: (T.NonRootDetails | T.DriveChildrenItemFile)[]): TR.Tree<T.DetailsOrFile<T.DetailsDocwsRoot>> => {
//   const tree: TR.Tree<T.DetailsOrFile<T.DetailsDocwsRoot>> = TR.make({}, items)
// }

type File = {
  type: 'FILE'
  name: string
  docwsid?: string
}

const file = ({ name, docwsid }: { name: string; docwsid?: string }): File => {
  return {
    type: 'FILE',
    name,
    docwsid,
  }
}

type AppLibray<T extends (Folder<any[]> | File)[]> = {
  name: string
  zone: string
  docwsid: string
  type: 'APP_LIBRARY'
  items: T
}

type Folder<T extends (Folder<any[]> | File)[]> = {
  name: string
  type: 'FOLDER'
  items: T
  docwsid?: string
}

const appLibrary = (
  { name, zone, docwsid }: { name: string; zone: string; docwsid: string },
) =>
  <T extends (Folder<any[]> | File)[]>(
    ...items: T
  ): AppLibray<T> => {
    return {
      type: 'APP_LIBRARY',
      name,
      docwsid,
      zone,
      items,
    }
  }

const folder = (
  { name, docwsid }: { name: string; docwsid?: string },
) =>
  <T extends (Folder<any[]> | File)[]>(
    ...items: T
  ): Folder<T> => {
    return {
      type: 'FOLDER',
      name,
      items,
      docwsid,
    }
  }

type DocwsRoot<T extends (Folder<any[]> | AppLibray<any[]> | File)[]> = {
  type: 'DOCWSROOT'
  items: T
}

type DocwsrootChildren = Folder<any[]> | AppLibray<any[]> | File

const docwsrootG = <T extends (Folder<any[]> | AppLibray<any[]> | File)[]>(
  ...items: T
): DocwsRoot<T> => {
  return {
    type: 'DOCWSROOT',
    items,
  }
}

type RootResult<T> = T extends [infer A, ...(infer Rest)] ? [
  A extends Folder<infer G> ? (
    Omit<Folder<G>, 'items'> & {
      details: T.DetailsFolder
      items: RootResult<G>
    }
  )
    : A extends AppLibray<infer G> ? (
      Omit<AppLibray<G>, 'items'> & {
        details: T.DetailsAppLibrary
        items: RootResult<G>
      }
    )
    : (File & { details: T.DriveChildrenItemFile }),
  ...RootResult<Rest>,
]
  : []

const makeFolder = ({ parentId, zone }: { parentId: string; zone: string }) =>
  (f: Folder<any[]>): Folder<any> & {
    details: T.DetailsFolder
    items: RootResult<any>
  } => {
    const docwsid = f.docwsid ?? randomUUIDCap()
    const drivewsid = `FOLDER::${zone}::${docwsid}`

    const items = f.items.map(makeItem({
      parentId: drivewsid,
      zone,
    }))

    return {
      ...f,
      details: {
        'dateCreated': '2022-02-18T13:49:00Z',
        'drivewsid': `FOLDER::${zone}::${docwsid}` as any,
        parentId,
        'name': f.name,
        'docwsid': docwsid,
        'zone': zone,
        'etag': '1pt',
        'type': 'FOLDER',
        'assetQuota': 14710,
        'fileCount': 2,
        'shareCount': 0,
        'shareAliasCount': 0,
        'directChildrenCount': 2,
        'items': items.map(_ => _.details),
        'numberOfItems': items.length,
        'status': 'OK',
      },
      items: items as any,
    }
  }

const makeAppLibrary = () =>
  (f: AppLibray<any[]>): AppLibray<any[]> & {
    details: T.DetailsAppLibrary
    items: RootResult<any>
  } => {
    const drivewsid = `FOLDER::${f.zone}::${f.docwsid}`

    const items = f.items.map(makeItem({
      parentId: drivewsid,
      zone: f.zone,
    }))

    return {
      ...f,
      details: {
        'dateCreated': '2021-07-27T04:01:10Z',
        'drivewsid': drivewsid as any,
        'docwsid': f.docwsid,
        'zone': f.zone,
        'name': f.name,
        'parentId': 'FOLDER::com.apple.CloudDocs::root',
        'etag': 'a3q',
        'type': 'APP_LIBRARY',
        'maxDepth': 'ANY',
        'icons': [],
        'supportedExtensions': [],
        numberOfItems: items.length,
        items: items.map(_ => _.details),
        status: 'OK',
        supportedTypes: [],
        // extension: '',
      },
      items: items as RootResult<any>,
    }
  }

const makeFile = (
  { parentId, zone, size = randomRange(0, 128000)() }: { parentId: string; zone: string; size?: number },
) =>
  (f: File): File & { details: T.DriveChildrenItemFile } => {
    const docwsid = f.docwsid ?? randomUUIDCap()
    return {
      ...f,
      details: {
        'drivewsid': `FILE::${zone}::${docwsid}` as any,
        'docwsid': docwsid,
        'zone': zone,
        'parentId': parentId,
        'dateCreated': '2021-08-31T10:40:16Z',
        'dateModified': '2021-09-30T11:36:46Z',
        'dateChanged': '2021-11-17T15:55:41Z',
        'size': size,
        'etag': '12g::12f',
        'type': 'FILE',
        ...parseFilename(f.name),
      },
    }
  }

const makeItem = (
  { parentId, zone }: { parentId: string; zone: string },
) =>
  (item: File | Folder<any[]> | AppLibray<any[]>) => {
    return item.type === 'FILE'
      ? makeFile({ parentId, zone })(item)
      : item.type === 'FOLDER'
      ? makeFolder({ parentId, zone })(item)
      : makeAppLibrary()(item)
  }

const getDetails = ({ details, items }: {
  details: T.DetailsOrFile<T.DetailsDocwsRoot>
  items?: ({
    details: T.DetailsFolder
    items: RootResult<any[]>
  } | {
    details: T.DetailsAppLibrary
    items: RootResult<any[]>
  } | {
    details: T.DriveChildrenItemFile
  })[]
}): T.DetailsOrFile<T.DetailsDocwsRoot>[] => {
  return [details, ...A.flatten((items ?? []).map(getDetails))]
}

const createDetails = <T extends (Folder<any[]> | AppLibray<any[]> | File)[]>(
  root: DocwsRoot<T>,
): {
  tree: {
    type: 'DOCWSROOT'
    details: T.DetailsDocwsRoot
    items: RootResult<T>
  }
  details: Record<string, T.DetailsOrFile<T.DetailsDocwsRoot>>
} => {
  const items = root.items.map(
    makeItem({
      parentId: rootDrivewsid,
      zone: 'com.apple.CloudDocs',
    }),
  )

  const details: T.DetailsDocwsRoot = {
    drivewsid: rootDrivewsid,
    'dateCreated': '2021-07-26T19:34:15Z',
    'docwsid': 'root',
    'zone': 'com.apple.CloudDocs',
    'name': '',
    'etag': 'axa',
    'type': 'FOLDER',
    'assetQuota': 72723230,
    'fileCount': 391,
    'shareCount': 0,
    'shareAliasCount': 0,
    'directChildrenCount': 7,
    'numberOfItems': items.length,
    'status': 'OK',
    items: items.map(_ => _.details),
  }

  return {
    tree: {
      type: 'DOCWSROOT',
      details,
      items: items as RootResult<T>,
    },
    details: pipe(
      A.flatten(items.map(getDetails)),
      A.prependW(details),
      A.map(_ => [_.drivewsid, _] as const),
      recordFromTuples,
    ),
  }
}
const retrieveItemDetailsInFolders = (
  detailsRec: Record<string, T.DetailsOrFile<T.DetailsDocwsRoot>>,
): ApiType['retrieveItemDetailsInFolders'] =>
  ({ drivewsids }) => {
    return pipe(
      drivewsids,
      NA.map(did => R.lookup(did)(detailsRec)),
      NA.map(O.foldW(() => T.invalidId, d => d)),
      SRTE.of,
    )
  }

describe('test-', () => {
  it('works', async () => {
    const { details, tree } = createDetails(docwsrootG(
      folder({ name: 'test1' })(),
      folder({ name: 'test2' })(
        file({ name: 'file1.txt' }),
        file({ name: 'file2.txt' }),
      ),
      folder({ name: 'test3' })(),
      appLibrary({
        name: 'Obsidian',
        docwsid: 'documents',
        zone: 'iCloud.md.obsidian',
      })(
        folder({ name: 'my1' })(
          file({ name: 'note1.md' }),
          file({ name: 'note2.md' }),
          folder({ name: 'bookmarks' })(
            file({ name: 'index.md' }),
          ),
        ),
      ),
    ))

    assert.equal(
      tree.items[1].items[0].details.parentId,
      tree.items[1].details.drivewsid,
    )

    assert.equal(
      tree.items[1].details.parentId,
      tree.details.drivewsid,
    )

    assert.equal(
      tree.items[3].items[0].items[2].items[0].details.zone,
      'iCloud.md.obsidian',
    )

    // console.log(
    //   JSON.stringify(details),
    // )

    // const state = {
    //   ...authorizedState,
    //   cache: C.cachef(),
    // }

    // const req = D.retrieveItemDetailsInFoldersSaving([rootDrivewsid])

    // req(state)({
    //   api: { retrieveItemDetailsInFolders },
    // })
  })
})

describe('retrieveItemDetailsInFoldersSaving', () => {
  it('works', async () => {
    // const d0 = createDetails(r0)

    // console.log(
    //   JSON.stringify(d0),
    // )

    // const state = {
    //   ...authorizedState,
    //   cache: C.cachef(),
    // }

    // const req = D.retrieveItemDetailsInFoldersSaving([rootDrivewsid])

    // req(state)({
    //   api: { retrieveItemDetailsInFolders },
    // })
  })
})
