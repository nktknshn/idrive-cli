import * as A from 'fp-ts/Array'
import { pipe } from 'fp-ts/lib/function'
import { randomRange } from 'fp-ts/lib/Random'
import { parseFilename } from '../src/icloud/drive/helpers'
import * as T from '../src/icloud/drive/types'
import { rootDrivewsid } from '../src/icloud/drive/types/types-io'
import { guardFst, guardFstRO, isDefined } from '../src/util/guards'
import { randomUUIDCap, recordFromTuples } from '../src/util/util'

// const folder = ({}: {
//   name: string
//   parentId: `FOLDER::${string}::${string}`
// }, items: (T.NonRootDetails | T.DriveChildrenItemFile)[]): TR.Tree<T.DetailsOrFile<T.DetailsDocwsRoot>> => {
//   const tree: TR.Tree<T.DetailsOrFile<T.DetailsDocwsRoot>> = TR.make({}, items)
// }
type File<N extends string> = {
  type: 'FILE'
  name: N
  docwsid?: string
  tag?: string
}

type DocwsRoot<T extends (Folder<any[], any> | AppLibray<any[], any> | File<any>)[]> = {
  type: 'DOCWSROOT'
  children: T
}

type RootResult<T> = T extends [infer A, ...(infer Rest)] ? [
  A extends Folder<infer G, infer N> ? (
    Omit<Folder<G, N>, 'children'> & {
      details: T.DetailsFolder
      children: RootResult<G>
    }
  )
    : A extends AppLibray<infer G, infer N> ? (
      Omit<AppLibray<G, N>, 'children'> & {
        details: T.DetailsAppLibrary
        children: RootResult<G>
      }
    )
    : (File<any> & { details: T.DriveChildrenItemFile }),
  ...RootResult<Rest>,
]
  : []

type RootDict<T> = T extends [infer A, ...(infer Rest)] ? 
  & (
    A extends Folder<infer G, infer N> ? (
      Record<
        N,
        {
          details: T.DetailsFolder
          byName: RootDict<G>
        } & Folder<G, N>
      >
    ) // {
      : //   details: T.DetailsFolder
      //   children: RootResult<G>
      // }
      A extends AppLibray<infer G, infer N> ? (
        Record<
          N,
          {
            details: T.DetailsAppLibrary
            byName: RootDict<G>
          } & AppLibray<G, N>
        >
      )
      : // A extends AppLibray<infer G> ? (
      //   Omit<AppLibray<G>, 'children'> & {
      //     details: T.DetailsAppLibrary
      //     children: RootResult<G>
      //   }
      // )
      A extends File<infer N> ? (Record<N, File<N> & { details: T.DriveChildrenItemFile }>)
      : never
    // ...RootDict<Rest>,
  )
  & RootDict<Rest>
  : {}

type AppLibray<T extends (Folder<any[], any> | File<any>)[], N extends string> = {
  name: N
  zone: string
  docwsid: string
  type: 'APP_LIBRARY'
  children: T
  tag?: string
}

type Folder<T extends (Folder<any[], any> | File<any>)[], N extends string> = {
  name: N
  type: 'FOLDER'
  children: T
  docwsid?: string
  tag?: string
}

export const file = <N extends string>({ name, docwsid, tag }: {
  name: N
  docwsid?: string
  tag?: string
}): File<N> => {
  return {
    type: 'FILE',
    name,
    docwsid,
    tag,
  }
}

export const appLibrary = <N extends string>(
  { name, zone, docwsid, tag }: { name: N; zone: string; docwsid: string; tag?: string },
) =>
  <T extends (Folder<any[], any> | File<any>)[]>(
    ...children: T
  ): AppLibray<T, N> => {
    return {
      type: 'APP_LIBRARY',
      name,
      docwsid,
      zone,
      children,
      tag,
    }
  }

export const folder = <N extends string>(
  { name, docwsid, tag }: { name: N; docwsid?: string; tag?: string },
) =>
  <T extends (Folder<any[], any> | File<any>)[]>(
    ...children: T
  ): Folder<T, N> => {
    return {
      type: 'FOLDER',
      name,
      children,
      docwsid,
      tag,
    }
  }

export const docwsrootG = <T extends (Folder<any[], any> | AppLibray<any[], any> | File<any>)[]>(
  ...children: T
): DocwsRoot<T> => {
  return {
    type: 'DOCWSROOT',
    children,
  }
}

const makeFolder = ({ parentId, zone }: { parentId: string; zone: string }) =>
  (f: Folder<any[], any>): Folder<any[], any> & {
    details: T.DetailsFolder
    children: RootResult<any>
    byName: RootDict<any>
  } => {
    const docwsid = f.docwsid ?? randomUUIDCap()
    const drivewsid = `FOLDER::${zone}::${docwsid}`

    const children = f.children.map(makeItem({
      parentId: drivewsid,
      zone,
    }))
    const byName = pipe(
      children.map(
        _ => [_.name, _] as const,
      ),
      recordFromTuples,
    )
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
        'items': children.map(_ => _.details),
        'numberOfItems': children.length,
        'status': 'OK',
      },
      children: children as any,
      byName,
    }
  }

const makeAppLibrary = () =>
  (f: AppLibray<any[], any>): AppLibray<any[], any> & {
    details: T.DetailsAppLibrary
    children: RootResult<any>
    byName: RootDict<any>
  } => {
    const drivewsid = `FOLDER::${f.zone}::${f.docwsid}`

    const children = f.children.map(makeItem({
      parentId: drivewsid,
      zone: f.zone,
    }))

    const byName = pipe(
      children.map(
        _ => [_.name, _] as const,
      ),
      recordFromTuples,
    )

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
        numberOfItems: children.length,
        items: children.map(_ => _.details),
        status: 'OK',
        supportedTypes: [],
        // extension: '',
      },
      children: children as RootResult<any>,
      byName,
    }
  }
const makeFile = (
  { parentId, zone, size = Math.round(randomRange(0, 128000)()) }: { parentId: string; zone: string; size?: number },
) =>
  (f: File<any>): File<any> & { details: T.DriveChildrenItemFile } => {
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
  (item: File<any> | Folder<any[], any> | AppLibray<any[], any>) => {
    return item.type === 'FILE'
      ? makeFile({ parentId, zone })(item)
      : item.type === 'FOLDER'
      ? makeFolder({ parentId, zone })(item)
      : makeAppLibrary()(item)
  }

const getDetails = ({ details, children }: {
  details: T.DetailsOrFile<T.DetailsDocwsRoot>
  children?: ({
    details: T.DetailsFolder
    children: RootResult<any[]>
  } | {
    details: T.DetailsAppLibrary
    children: RootResult<any[]>
  } | {
    details: T.DriveChildrenItemFile
  })[]
}): T.DetailsOrFile<T.DetailsDocwsRoot>[] => {
  return [details, ...A.flatten((children ?? []).map(getDetails))]
}

type Child = ({
  details: T.DetailsFolder
  children: RootResult<any[]>
  byName: RootDict<any>
} | {
  details: T.DetailsAppLibrary
  children: RootResult<any[]>
  byName: RootDict<any>
} | {
  details: T.DriveChildrenItemFile
})

type Item = {
  tag?: string
  details: T.DetailsOrFile<T.DetailsDocwsRoot>
  children?: Child[]
}

const getItems = (item: Item): Item[] => {
  return [item, ...A.flatten((item.children ?? []).map(getItems))]
}

export const createDetails = <T extends (Folder<any[], any> | AppLibray<any[], any> | File<any>)[]>(
  root: DocwsRoot<T>,
): {
  root: {
    type: 'DOCWSROOT'
    details: T.DetailsDocwsRoot
    children: RootResult<T>
    byName: RootDict<T>
  }
  details: Record<string, T.DetailsOrFile<T.DetailsDocwsRoot>>
  byTag: Record<string, Item>
} => {
  const children = root.children.map(
    makeItem({
      parentId: rootDrivewsid,
      zone: 'com.apple.CloudDocs',
    }),
  )

  const byName = pipe(
    children.map(
      _ => [_.name, _] as const,
    ),
    recordFromTuples,
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
    'numberOfItems': children.length,
    'status': 'OK',
    items: children.map(_ => _.details),
  }

  return {
    root: {
      type: 'DOCWSROOT',
      details,
      children: children as RootResult<T>,
      byName: byName as RootDict<T>,
    },
    details: pipe(
      A.flatten(children.map(getDetails)),
      A.prependW(details),
      A.map(_ => [_.drivewsid, _] as const),
      recordFromTuples,
    ),
    byTag: pipe(
      A.flatten(children.map(getItems)),
      A.map(_ => [_.tag, _] as const),
      A.filter(guardFstRO(isDefined)),
      recordFromTuples,
    ),
  }
}
