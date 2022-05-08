import * as A from 'fp-ts/Array'
import { pipe } from 'fp-ts/lib/function'
import { randomRange } from 'fp-ts/lib/Random'
import * as R from 'fp-ts/Record'
import { T } from '../../icloud-drive'
import { rootDrivewsid } from '../../icloud-drive/icloud-drive-items-types/types-io'
import * as V from '../../icloud-drive/util/get-by-path-types'
import { guardFst, guardFstRO, isDefined } from '../../util/guards'
import { parseFilename } from '../../util/parse-filename'
import { randomUUIDCap, recordFromTuples } from '../../util/util'

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
      validPath: V.PathValid<T.DetailsDocwsRoot>
      // detailsPath: V.Hierarchy<T.DetailsDocwsRoot>
    }
  )
    : A extends AppLibray<infer G, infer N> ? (
      Omit<AppLibray<G, N>, 'children'> & {
        details: T.DetailsAppLibrary
        children: RootResult<G>
        validPath: V.PathValid<T.DetailsDocwsRoot>
        // detailsPath: V.Hierarchy<T.DetailsDocwsRoot>
      }
    )
    : (File<any> & {
      details: T.DriveChildrenItemFile
      validPath: V.PathValid<T.DetailsDocwsRoot>
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
          details: T.DetailsFolder
          byName: RootDict<G>
          validPath: V.PathValid<T.DetailsDocwsRoot>
        } & Folder<G, N>
      >
    ) // {
      : A extends AppLibray<infer G, infer N> ? (
        Record<
          N,
          {
            details: T.DetailsAppLibrary
            byName: RootDict<G>
            validPath: V.PathValid<T.DetailsDocwsRoot>
          } & AppLibray<G, N>
        >
      )
      : A extends File<infer N> ? (Record<N, File<N> & { details: T.DriveChildrenItemFile }>)
      : never
    // ...RootDict<Rest>,
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

export const docwsroot = <T extends (Folder<any[], any> | AppLibray<any[], any> | File<any>)[]>(
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
    const docwsid = f.docwsid ?? (randomUUIDCap() + '::' + f.name)
    // randomUUIDCap()
    const drivewsid = `FOLDER::${zone}::${docwsid}`

    const children = f.children.map(
      makeItem({
        parentId: drivewsid,
        zone,
      }),
    )

    const byName = pipe(
      children.map(_ => [_.name, _] as const),
      recordFromTuples,
    )

    const details: T.DetailsFolder = {
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
      items: children.map(_ => ({
        ..._.details,
        items: undefined,
      })),
      'numberOfItems': children.length,
      'status': 'OK',
    }

    return {
      ...f,
      details,
      children: pipe(children) as any,
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
      children.map(_ => [_.name, _] as const),
      recordFromTuples,
    )

    const details: T.DetailsAppLibrary = {
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
      items: children.map(_ => ({ ..._.details, items: undefined })),
      status: 'OK',
      supportedTypes: [],
      // extension: '',
    }

    return {
      ...f,
      details,
      children: children as RootResult<any>,
      byName,
    }
  }

const makeFile = (
  { parentId, zone, size = Math.round(randomRange(0, 128000)()) }: { parentId: string; zone: string; size?: number },
) =>
  (f: File<any>): File<any> & { details: T.DriveChildrenItemFile } => {
    const docwsid = f.docwsid ?? (randomUUIDCap() + '::' + f.name)
    // randomUUIDCap()
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
  (item: File<any> | Folder<any[], any> | AppLibray<any[], any>): Child => {
    return item.type === 'FILE'
      ? makeFile({ parentId, zone })(item)
      : item.type === 'FOLDER'
      ? makeFolder({ parentId, zone })(item)
      : makeAppLibrary()(item)
  }

type Child =
  | (File<any> & {
    details: T.DriveChildrenItemFile
  })
  | (Folder<any[], any> & {
    details: T.DetailsFolder
    children: RootResult<any>
    byName: RootDict<any>
  })
  | (AppLibray<any[], any> & {
    details: T.DetailsAppLibrary
    children: RootResult<any>
    byName: RootDict<any>
  })

type Item = {
  tag?: string
  details: T.DetailsOrFile<T.DetailsDocwsRoot>
  children?: Child[]
}

const getItems = (item: Item): Item[] => {
  return [item, ...A.flatten((item.children ?? []).map(getItems))]
}

const addValidPath = <C extends Child>(
  item: C,
  parentPath: V.PathValid<T.DetailsDocwsRoot>,
): C & {
  // children?: (C & { validPath: V.PathValid<T.DetailsDocwsRoot> })[]
  validPath: V.PathValid<T.DetailsDocwsRoot>
} => {
  return {
    ...item,
    validPath: parentPath,
    // children: 'children' in item
    //   ? pipe(
    //     item.children,
    //     A.map(a =>
    //       addValidPath(
    //         a,
    //         V.validPath(
    //           V.concat(parentPath.details, [item.details]),
    //         ),
    //       )
    //     ),
    //   )
    //   : undefined,
  }
}

export const createRootDetails = <T extends (Folder<any[], any> | AppLibray<any[], any> | File<any>)[]>(
  tree: DocwsRoot<T>,
): {
  root: {
    details: T.DetailsDocwsRoot
    children: RootResult<T>
    childrenWithPath: RootResult<T>
    byName: RootDict<T>
  }
  itemByDrivewsid: Record<string, T.DetailsOrFile<T.DetailsDocwsRoot>>
  allFolders: (T.DetailsDocwsRoot | T.NonRootDetails)[]
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
    // A.map(
    //   c => addValidPath(c, V.validPath([details])),
    // ),
  )

  const byName = pipe(
    children.map(_ => [_.name, _] as const),
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
    items: children.map(_ => ({
      ..._.details,
      items: undefined,
    })),
  }

  // const children1 = pipe(
  //   children,
  //   A.map(c => ({ ...c, detailsPath: [details] })),
  // )

  const itemByDrivewsid = pipe(
    children.map(getItems),
    A.flatten,
    A.map(_ => _.details),
    A.prependW(details),
    A.map(_ => [_.drivewsid, _] as const),
    recordFromTuples,
  )

  return {
    root: {
      details,
      children: children as RootResult<T>,
      childrenWithPath: children.map(
        c => addValidPath(c, V.validPath([details])),
      ) as RootResult<T>,
      byName: byName as RootDict<T>,
    },
    itemByDrivewsid: itemByDrivewsid,
    byTag: pipe(
      A.flatten(children.map(getItems)),
      A.map(_ => [_.tag, _] as const),
      A.filter(guardFstRO(isDefined)),
      recordFromTuples,
    ),
    tree,
    allFolders: pipe(
      Object.values(itemByDrivewsid),
      A.filter(T.isDetailsG),
    ),
  }
}

// export const removeByTag = () => {
// }
// import * as O from 'fp-ts/Option'

// const validPathByDrivewsid = (drivewsid: string) =>
//   (
//     itemByDrivewsid: Record<string, T.DetailsOrFile<T.DetailsDocwsRoot>>,
//   ) => {
//   }

export const removeByDrivewsid = (drivewsid: string) =>
  (
    itemByDrivewsid: Record<string, T.DetailsOrFile<T.DetailsDocwsRoot>>,
  ): Record<string, T.DetailsOrFile<T.DetailsDocwsRoot>> => {
    const go = (drivewsid: string) =>
      (
        itemByDrivewsid: Record<string, T.DetailsOrFile<T.DetailsDocwsRoot>>,
      ): Record<string, T.DetailsOrFile<T.DetailsDocwsRoot>> => {
        return pipe(
          itemByDrivewsid,
          R.filter(T.isNotRootDetails),
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
        T.isFolderLike(d)
          ? ({
            ...d,
            items: pipe(
              d.items,
              A.filter(_ => _.drivewsid !== drivewsid),
            ),
          })
          : d
      ),
    )
  }
