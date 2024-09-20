import * as A from "fp-ts/Array";
import { pipe } from "fp-ts/lib/function";
import { randomRange } from "fp-ts/lib/Random";
import * as O from "fp-ts/Option";
import * as R from "fp-ts/Record";
import { Cache, Types } from "../../../../src/icloud-drive";
import { rootDrivewsid } from "../../../../src/icloud-drive/drive-types/types-io";
import * as V from "../../../../src/icloud-drive/util/get-by-path-types";
import { parseFilename } from "../../../../src/util/filename";
import { NormalizedPath, npath, Path } from "../../../../src/util/path";
import { randomUUIDCap, recordFromTuples } from "../../../../src/util/util";

type File<N extends string> = {
  type: "FILE";
  name: N;
  docwsid?: string;
  tag?: string;
  dateModified?: Date;
  size?: number;
};

type DocwsRoot<T extends (Folder<any[], any> | AppLibray<any[], any> | File<any>)[]> = {
  type: "DOCWSROOT";
  children: T;
};

type AppLibray<T extends (Folder<any[], any> | File<any>)[], N extends string> = {
  name: N;
  zone: string;
  docwsid: string;
  type: "APP_LIBRARY";
  children: T;
  tag?: string;
};

type Folder<T extends (Folder<any[], any> | File<any>)[], N extends string> = {
  name: N;
  type: "FOLDER";
  children: T;
  docwsid?: string;
  tag?: string;
};

export const file = <N extends string>({ name, docwsid, tag, dateModified }: {
  name: N;
  docwsid?: string;
  tag?: string;
  dateModified?: Date;
}): File<N> => {
  return { type: "FILE", name, docwsid, tag, dateModified };
};

export const appLibrary = <N extends string>(
  { name, zone, docwsid, tag }: { name: N; zone: string; docwsid: string; tag?: string },
) =>
<T extends (Folder<any[], any> | File<any>)[]>(
  ...children: T
): AppLibray<T, N> => {
  return { type: "APP_LIBRARY", name, docwsid, zone, children, tag };
};

export const folder = <N extends string>(
  { name, docwsid, tag }: { name: N; docwsid?: string; tag?: string },
) =>
<T extends (Folder<any[], any> | File<any>)[]>(
  ...children: T
): Folder<T, N> => {
  return { type: "FOLDER", name, children, docwsid, tag };
};

export const docwsroot = <T extends (Folder<any[], any> | AppLibray<any[], any> | File<any>)[]>(
  ...children: T
): DocwsRoot<T> => {
  return {
    type: "DOCWSROOT",
    children,
  };
};

export type ChildFile =
  & File<any>
  & {
    d: Types.DriveChildrenItemFile;
    path: NormalizedPath;
    mtime: Date;
  };

export type ChildFolder = Folder<any[], any> & {
  d: Types.DetailsFolder;
  children: ChildrenArray<any>;
  c: ChildrenTree<any>;
  path: NormalizedPath;
};

export type ChildAppLibrary = AppLibray<any[], any> & {
  d: Types.DetailsAppLibrary;
  children: ChildrenArray<any>;
  c: ChildrenTree<any>;
  path: NormalizedPath;
};

/** a folder's children */
export type Child =
  | ChildFile
  | ChildFolder
  | ChildAppLibrary;

/** Typed children array */
type ChildrenArray<TChildren> = TChildren extends [infer TChild, ...(infer TChildrenRest)] ? [
    TChild extends Folder<infer G, infer N> ? (
        & Omit<Folder<G, N>, "children">
        & {
          d: Types.DetailsFolder;
          children: ChildrenArray<G>;
          validPath: V.PathValid<Types.DetailsDocwsRoot>;
        }
      )
      : TChild extends AppLibray<infer G, infer N> ? (
          & Omit<AppLibray<G, N>, "children">
          & {
            d: Types.DetailsAppLibrary;
            children: ChildrenArray<G>;
            validPath: V.PathValid<Types.DetailsDocwsRoot>;
          }
        )
      : (
        & File<any>
        & {
          d: Types.DriveChildrenItemFile;
          validPath: V.PathValid<Types.DetailsDocwsRoot>;
        }
      ),
    ...ChildrenArray<TChildrenRest>,
  ]
  : [];

/** Typed children tree */
type ChildrenTree<TChildren> = TChildren extends [infer TChild, ...(infer TChildrenRest)] ?
    & (
      TChild extends Folder<infer TFolderChildren, infer TFolderName> ? (
          Record<
            TFolderName,
            // Child
            & {
              /** folder details */
              d: Types.DetailsFolder;
              /** children dict */
              c: ChildrenTree<TFolderChildren>;
              // validPath: V.PathValid<Types.DetailsDocwsRoot>;
              path: NormalizedPath;
            }
            & Folder<TFolderChildren, TFolderName>
          >
        )
        : TChild extends AppLibray<infer TAppLibChildren, infer TAppLibName> ? (
            Record<
              TAppLibName,
              // Child
              & {
                d: Types.DetailsAppLibrary;
                c: ChildrenTree<TAppLibChildren>;
                // validPath: V.PathValid<Types.DetailsDocwsRoot>;
                path: NormalizedPath;
              }
              & AppLibray<TAppLibChildren, TAppLibName>
            >
          )
        : TChild extends File<infer TFileName> ? Record<
            TFileName,
            // Child
            & {
              d: Types.DriveChildrenItemFile;
              path: NormalizedPath;
              mtime: Date;
            }
            & File<TFileName>
          >
        : never
    )
    & ChildrenTree<TChildrenRest>
  : Record<string, unknown>;

export const makeFolder =
  ({ parentId, zone, parentPath }: { parentId: string; zone: string; parentPath?: string }) =>
  (f: Folder<any[], any>): ChildFolder => {
    const docwsid = f.docwsid ?? (randomUUIDCap() + "::" + f.name);
    const drivewsid = `FOLDER::${zone}::${docwsid}`;
    const path = npath(parentPath ? Path.join(parentPath, f.name) : f.name);

    const childrenArray = f.children.map(
      makeChild({ parentId: drivewsid, zone, parentPath: path }),
    );

    const childrenTree = pipe(
      childrenArray.map(_ => [_.name, _] as const),
      recordFromTuples,
    );

    const d: Types.DetailsFolder = {
      "dateCreated": "2022-02-18T13:49:00Z",
      "drivewsid": `FOLDER::${zone}::${docwsid}` as any,
      parentId,
      "name": f.name,
      "docwsid": docwsid,
      "zone": zone,
      "etag": "1pt",
      "type": "FOLDER",
      "assetQuota": 14710,
      "fileCount": 2, // ???
      "shareCount": 0,
      "shareAliasCount": 0,
      "directChildrenCount": 2,
      items: childrenArray.map(_ => _.d),
      "numberOfItems": childrenArray.length,
      "status": "OK",
    };

    return {
      ...f,
      d: d,
      children: childrenArray as any,
      c: childrenTree,
      path,
    };
  };

const makeAppLibrary = () => (f: AppLibray<any[], any>): ChildAppLibrary => {
  const drivewsid = `FOLDER::${f.zone}::${f.docwsid}`;

  const children = f.children.map(makeChild({
    parentId: drivewsid,
    zone: f.zone,
    parentPath: `/${f.name}`,
  }));

  const c = pipe(
    children.map(_ => [_.name, _] as const),
    recordFromTuples,
  );

  const d: Types.DetailsAppLibrary = {
    "dateCreated": "2021-07-27T04:01:10Z",
    "drivewsid": drivewsid as any,
    "docwsid": f.docwsid,
    "zone": f.zone,
    "name": f.name,
    "parentId": "FOLDER::com.apple.CloudDocs::root",
    "etag": "a3q",
    "type": "APP_LIBRARY",
    "maxDepth": "ANY",
    numberOfItems: children.length,
    items: children.map(_ => _.d),
    status: "OK",
    supportedTypes: [],
  };

  return {
    ...f,
    d: d,
    children: children as ChildrenArray<any>,
    c,
    path: npath(`/${d.name}`),
  };
};

const makeFile = (
  {
    parentId,
    zone,
    size = Math.round(randomRange(0, 128000)()),
    dateModified = new Date("2021-09-30T11:36:46Z"),
    dateCreated = dateModified,
    dateChanged = dateModified,
    parentPath,
  }: {
    parentId: string;
    zone: string;
    size?: number;
    parentPath?: string;
    dateCreated?: Date;
    dateModified?: Date;
    dateChanged?: Date;
  },
) =>
(f: File<any>): ChildFile => {
  const docwsid = f.docwsid ?? (randomUUIDCap() + "::" + f.name);
  return {
    ...f,
    d: {
      "drivewsid": `FILE::${zone}::${docwsid}` as any,
      "docwsid": docwsid,
      "zone": zone,
      "parentId": parentId,
      // TODO: dates
      "dateCreated": dateCreated.toISOString(),
      "dateModified": f.dateModified?.toISOString() ?? dateModified.toISOString(),
      "dateChanged": dateChanged.toISOString(),
      "size": f.size ?? size,
      "etag": "12g::12f",
      "type": "FILE",
      ...parseFilename(f.name),
    },
    path: npath(parentPath ? Path.join(parentPath, f.name) : f.name),
    mtime: dateModified,
  };
};

const makeChild = (
  { parentId, zone, parentPath }: { parentId: string; zone: string; parentPath?: string },
) =>
(item: File<any> | Folder<any[], any> | AppLibray<any[], any>): Child => {
  return item.type === "FILE"
    ? makeFile({ parentId, zone, parentPath })(item)
    : item.type === "FOLDER"
    ? makeFolder({ parentId, zone, parentPath })(item)
    : makeAppLibrary()(item);
};

/** recursively get all details from children */
const getDetails = (item: Child): Types.DetailsOrFile<Types.DetailsDocwsRoot>[] => {
  if ("children" in item) {
    return [
      item.d,
      ...pipe(item.children, A.map(getDetails), A.flatten),
    ];
  }

  return [item.d];
};

const getChildren = (item: Child): Child[] => {
  if ("children" in item) {
    return [
      item,
      ...pipe(item.children, A.map(getChildren), A.flatten),
    ];
  }

  return [item];
};

const addValidPath = <C extends Child>(
  item: C,
  parentPath: V.PathValid<Types.DetailsDocwsRoot>,
): C & {
  validPath: V.PathValid<Types.DetailsDocwsRoot>;
} => {
  return {
    ...item,
    validPath: parentPath,
  };
};

export type RootDetails<T> = {
  /** root folder details */
  d: Types.DetailsDocwsRoot;
  /** root children array */
  children: ChildrenArray<T>;
  childrenWithPath: ChildrenArray<T>;
  /** children tree */
  c: ChildrenTree<T>;
  byPath: Record<string, Child>;
};

export const createRootDetails = <T extends (Folder<any[], any> | AppLibray<any[], any> | File<any>)[]>(
  tree: DocwsRoot<T>,
): {
  /** root details */
  r: RootDetails<T>;
  itemByDrivewsid: Record<string, Types.DetailsOrFile<Types.DetailsDocwsRoot>>;
  /** cache containing all details */
  cache: Cache.LookupCache;
  allFolders: (Types.DetailsDocwsRoot | Types.NonRootDetails)[];
  // byTag: Record<string, Item>;
  tree: DocwsRoot<T>;
} => {
  const children = pipe(
    tree.children.map(
      makeChild({
        parentId: rootDrivewsid,
        zone: "com.apple.CloudDocs",
        parentPath: "/",
      }),
    ),
  );

  const childrenRecord = pipe(
    children.map(_ => [_.name, _] as const),
    recordFromTuples,
  );

  const d: Types.DetailsDocwsRoot = {
    drivewsid: rootDrivewsid,
    "dateCreated": "2021-07-26T19:34:15Z",
    "docwsid": "root",
    "zone": "com.apple.CloudDocs",
    "name": "",
    "etag": "axa",
    "type": "FOLDER",
    "assetQuota": 72723230,
    "fileCount": 391,
    "shareCount": 0,
    "shareAliasCount": 0,
    "directChildrenCount": 7,
    "numberOfItems": children.length,
    "status": "OK",
    items: children.map(_ => _.d),
  };

  const itemByDrivewsid = pipe(
    children,
    A.map(getDetails),
    A.flatten,
    A.prependW(d),
    A.map(_ => [_.drivewsid, _] as const),
    recordFromTuples,
  );

  const allFolders = pipe(
    Object.values(itemByDrivewsid),
    A.filter(Types.isDetailsG),
  );

  // cache contains all details
  const cache = pipe(
    Cache.cache(),
    Cache.putDetailss([d, ...allFolders]),
  );

  const byPath = pipe(
    children,
    A.map(getChildren),
    A.flatten,
    A.map(_ => [_.path, _] as const),
    recordFromTuples,
  );

  return {
    // root
    r: {
      // root details
      d,
      // root children
      children: children as ChildrenArray<T>,
      childrenWithPath: children.map(
        c => addValidPath(c, V.validPath([d])),
      ) as ChildrenArray<T>,
      c: childrenRecord as ChildrenTree<T>,
      byPath,
    },
    itemByDrivewsid,
    allFolders,
    cache,
    // byTag,
    tree,
  };
};

export const getByPath = (path: string, root: RootDetails<any>): Child => {
  const o = R.lookup(path, root.byPath);

  if (O.isSome(o)) {
    return o.value;
  }

  throw new Error(`Invalid path: ${path}`);
};

export const getByPathFile = (path: string, root: RootDetails<any>): ChildFile => {
  const res = getByPath(path, root);

  if (res.type === "FILE") {
    return res;
  }
  throw new Error(`Invalid file: ${path}`);
};

export const getByPathFolder = (path: string, root: RootDetails<any>): ChildFolder => {
  const res = getByPath(path, root);

  if (res.type === "FOLDER") {
    return res;
  }
  throw new Error(`Invalid folder: ${path}`);
};

export const getByPathAppLibrary = (path: string, root: RootDetails<any>): ChildAppLibrary => {
  const res = getByPath(path, root);

  if (res.type === "APP_LIBRARY") {
    return res;
  }
  throw new Error(`Invalid app library: ${path}`);
};

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
    );
  };

  return pipe(
    go(drivewsid)(itemByDrivewsid),
    R.map(d =>
      Types.isFolderLike(d)
        ? ({ ...d, items: pipe(d.items, A.filter(_ => _.drivewsid !== drivewsid)) })
        : d
    ),
  );
};
