import * as A from 'fp-ts/Array'
import { pipe } from 'fp-ts/lib/function'
import { randomRange } from 'fp-ts/lib/Random'
import * as R from 'fp-ts/Record'
import { Cache, GetByPath, Types } from '../../../../src/icloud-drive'
import { rootDrivewsid } from '../../../../src/icloud-drive/drive-types/types-io'
import * as V from '../../../../src/icloud-drive/util/get-by-path-types'
import { parseFilename } from '../../../../src/util/filename'
import { guardFstRO, isDefined } from '../../../../src/util/guards'
import { randomUUIDCap, recordFromTuples } from '../../../../src/util/util'

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
      d: Types.DetailsFolder
      children: RootResult<G>
      validPath: V.PathValid<Types.DetailsDocwsRoot>
      // detailsPath: V.Hierarchy<T.DetailsDocwsRoot>
    }
  )
    : A extends AppLibray<infer G, infer N> ? (
      Omit<AppLibray<G, N>, 'children'> & {
        d: Types.DetailsAppLibrary
        children: RootResult<G>
        validPath: V.PathValid<Types.DetailsDocwsRoot>
        // detailsPath: V.Hierarchy<T.DetailsDocwsRoot>
      }
    )
    : (File<any> & {
      d: Types.DriveChildrenItemFile
      validPath: V.PathValid<Types.DetailsDocwsRoot>
      // detailsPath:V.Hierarchy<T.DetailsDocwsRoot>
    }),
  ...RootResult<Rest>,
]
  : []

type RootDict<T> = T extends [infer A, ...(infer Rest)] ? 
  & (
    A extends Folder<infer G, infer N> ? (
      Record<
        N,
        {
          /** folder details */
          d: Types.DetailsFolder
          /** children dict */
          c: RootDict<G>
          validPath: V.PathValid<Types.DetailsDocwsRoot>
        } & Folder<G, N>
      >
    ) // {
      : A extends AppLibray<infer G, infer N> ? (
        Record<
          N,
          {
            d: Types.DetailsAppLibrary
            c: RootDict<G>
            validPath: V.PathValid<Types.DetailsDocwsRoot>
          } & AppLibray<G, N>
        >
      )
      : A extends File<infer N> ? (Record<N, File<N> & { d: Types.DriveChildrenItemFile }>)
      : never
  )
  & RootDict<Rest>
  : Record<string, unknown>

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
  return { type: 'FILE', name, docwsid, tag }
}

export const appLibrary = <N extends string>(
  { name, zone, docwsid, tag }: { name: N; zone: string; docwsid: string; tag?: string },
) =>
  <T extends (Folder<any[], any> | File<any>)[]>(
    ...children: T
  ): AppLibray<T, N> => {
    return { type: 'APP_LIBRARY', name, docwsid, zone, children, tag }
  }

export const folder = <N extends string>(
  { name, docwsid, tag }: { name: N; docwsid?: string; tag?: string },
) =>
  <T extends (Folder<any[], any> | File<any>)[]>(
    ...children: T
  ): Folder<T, N> => {
    return { type: 'FOLDER', name, children, docwsid, tag }
  }

export const docwsroot = <T extends (Folder<any[], any> | AppLibray<any[], any> | File<any>)[]>(
  ...children: T
): DocwsRoot<T> => {
  return {
    type: 'DOCWSROOT',
    children,
  }
}

export const makeFolder = ({ parentId, zone }: { parentId: string; zone: string }) =>
  (f: Folder<any[], any>):
    & Folder<any[], any>
    & {
      d: Types.DetailsFolder
      children: RootResult<any>
      c: RootDict<any>
      // validPath: V.PathValid<Types.DetailsDocwsRoot>
    } =>
  {
    const docwsid = f.docwsid ?? (randomUUIDCap() + '::' + f.name)
    const drivewsid = `FOLDER::${zone}::${docwsid}`

    const children = f.children.map(
      makeItem({
        parentId: drivewsid,
        zone,
      }),
    )

    const childrenRecord = pipe(
      children.map(_ => [_.name, _] as const),
      recordFromTuples,
    )

    const d: Types.DetailsFolder = {
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
      items: children.map(_ => _.d),
      'numberOfItems': children.length,
      'status': 'OK',
    }

    return {
      ...f,
      d: d,
      children: pipe(children) as any,
      c: childrenRecord,
      // validPath: GetByPath.validFolder<Types.DetailsDocwsRoot>([d]),
    }
  }

const makeAppLibrary = () =>
  (f: AppLibray<any[], any>): AppLibray<any[], any> & {
    d: Types.DetailsAppLibrary
    children: RootResult<any>
    c: RootDict<any>
  } => {
    const drivewsid = `FOLDER::${f.zone}::${f.docwsid}`

    const children = f.children.map(makeItem({
      parentId: drivewsid,
      zone: f.zone,
    }))

    const c = pipe(
      children.map(_ => [_.name, _] as const),
      recordFromTuples,
    )

    const d: Types.DetailsAppLibrary = {
      'dateCreated': '2021-07-27T04:01:10Z',
      'drivewsid': drivewsid as any,
      'docwsid': f.docwsid,
      'zone': f.zone,
      'name': f.name,
      'parentId': 'FOLDER::com.apple.CloudDocs::root',
      'etag': 'a3q',
      'type': 'APP_LIBRARY',
      'maxDepth': 'ANY',
      // 'icons': [],
      // 'supportedExtensions': [],
      numberOfItems: children.length,
      items: children.map(_ => _.d),
      status: 'OK',
      supportedTypes: [],
    }

    return {
      ...f,
      d: d,
      children: children as RootResult<any>,
      c,
    }
  }

const makeFile = (
  { parentId, zone, size = Math.round(randomRange(0, 128000)()) }: { parentId: string; zone: string; size?: number },
) =>
  (f: File<any>): File<any> & { d: Types.DriveChildrenItemFile } => {
    const docwsid = f.docwsid ?? (randomUUIDCap() + '::' + f.name)
    return {
      ...f,
      d: {
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
  (item: File<any> | Folder<any[], any> | AppLibray<any[], any>): Child => {
    return item.type === 'FILE'
      ? makeFile({ parentId, zone })(item)
      : item.type === 'FOLDER'
      ? makeFolder({ parentId, zone })(item)
      : makeAppLibrary()(item)
  }

type Child =
  | (File<any> & {
    d: Types.DriveChildrenItemFile
  })
  | (Folder<any[], any> & {
    d: Types.DetailsFolder
    children: RootResult<any>
    c: RootDict<any>
  })
  | (AppLibray<any[], any> & {
    d: Types.DetailsAppLibrary
    children: RootResult<any>
    c: RootDict<any>
  })

type Item = {
  tag?: string
  d: Types.DetailsOrFile<Types.DetailsDocwsRoot>
  children?: Child[]
}

const getItems = (item: Item): Item[] => {
  return [item, ...A.flatten((item.children ?? []).map(getItems))]
}

const addValidPath = <C extends Child>(
  item: C,
  parentPath: V.PathValid<Types.DetailsDocwsRoot>,
): C & {
  validPath: V.PathValid<Types.DetailsDocwsRoot>
} => {
  return {
    ...item,
    validPath: parentPath,
  }
}

export const createRootDetails = <T extends (Folder<any[], any> | AppLibray<any[], any> | File<any>)[]>(
  tree: DocwsRoot<T>,
): {
  /** root details */
  r: {
    /** folder details */
    d: Types.DetailsDocwsRoot
    children: RootResult<T>
    childrenWithPath: RootResult<T>
    /** children dict */
    c: RootDict<T>
  }
  itemByDrivewsid: Record<string, Types.DetailsOrFile<Types.DetailsDocwsRoot>>
  /** cache containing all details */
  cache: Cache.LookupCache
  allFolders: (Types.DetailsDocwsRoot | Types.NonRootDetails)[]
  byTag: Record<string, Item>
  tree: DocwsRoot<T>
} => {
  const children = pipe(
    tree.children.map(
      makeItem({
        parentId: rootDrivewsid,
        zone: 'com.apple.CloudDocs',
      }),
    ),
  )

  const childrenRecord = pipe(
    children.map(_ => [_.name, _] as const),
    recordFromTuples,
  )

  const d: Types.DetailsDocwsRoot = {
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
    items: children.map(_ => _.d),
  }

  const itemByDrivewsid = pipe(
    children.map(getItems),
    A.flatten,
    A.map(_ => _.d),
    A.prependW(d),
    A.map(_ => [_.drivewsid, _] as const),
    recordFromTuples,
  )

  const allFolders = pipe(
    Object.values(itemByDrivewsid),
    A.filter(Types.isDetailsG),
  )

  const byTag = pipe(
    A.flatten(children.map(getItems)),
    A.map(_ => [_.tag, _] as const),
    A.filter(guardFstRO(isDefined)),
    recordFromTuples,
  )

  // cache contains all details
  const cache = pipe(
    Cache.cache(),
    Cache.putDetailss([d, ...allFolders]),
  )

  return {
    // root
    r: {
      // root details
      d,
      // root children
      children: children as RootResult<T>,
      childrenWithPath: children.map(
        c => addValidPath(c, V.validPath([d])),
      ) as RootResult<T>,
      c: childrenRecord as RootDict<T>,
    },
    itemByDrivewsid,
    allFolders,
    cache,
    byTag,
    tree,
  }
}

export const removeByDrivewsid = (drivewsid: string) =>
  (
    itemByDrivewsid: Record<string, Types.DetailsOrFile<Types.DetailsDocwsRoot>>,
  ): Record<string, Types.DetailsOrFile<Types.DetailsDocwsRoot>> => {
    const go = (drivewsid: string) =>
      (
        itemByDrivewsid: Record<string, Types.DetailsOrFile<Types.DetailsDocwsRoot>>,
      ): Record<string, Types.DetailsOrFile<Types.DetailsDocwsRoot>> => {
        return pipe(
          itemByDrivewsid,
          R.filter(Types.isNotRootDetails),
          R.filter(_ => _.parentId === drivewsid),
          R.keys,
          A.reduce(
            R.deleteAt(drivewsid)(itemByDrivewsid),
            (acc, cur) => go(cur)(acc),
          ),
        )
      }

    return pipe(
      go(drivewsid)(itemByDrivewsid),
      R.map(d =>
        Types.isFolderLike(d)
          ? ({ ...d, items: pipe(d.items, A.filter(_ => _.drivewsid !== drivewsid)) })
          : d
      ),
    )
  }
