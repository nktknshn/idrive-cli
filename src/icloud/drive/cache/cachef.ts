import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { constant, flow, identity, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as R from 'fp-ts/lib/Record'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import * as m from 'monocle-ts'
import Path from 'path'
import { error, TypeDecodingError } from '../../../lib/errors'
import { tryReadJsonFile } from '../../../lib/files'
import { saveJson } from '../../../lib/json'
import { cacheLogger, logger, logReturn, logReturnAs } from '../../../lib/logging'
import { hasOwnProperty, isObjectWithOwnProperty } from '../../../lib/util'
import { fileName, hierarchyToPath, normalizePath, parsePath } from '../helpers'
import {
  DriveChildrenItem,
  DriveDetails,
  DriveDetailsRoot,
  Hierarchy,
  isFolderDetails,
  isRootDetails,
  rootDrivewsid,
} from '../types'
import { MissingParentError } from './errors'
import {
  CacheEntityAppLibrary,
  CacheEntityAppLibraryDetails,
  CacheEntityAppLibraryItem,
  CacheEntityFile,
  CacheEntityFolder,
  CacheEntityFolderDetails,
  CacheEntityFolderItem,
  CacheEntityFolderRootDetails,
  ICloudDriveCache,
  ICloudDriveCacheEntity,
} from './types'

class lens {
  // public static root = m.Lens.fromProp<ICloudDriveCache>()('root')
  // public static byPath = m.Lens.fromProp<ICloudDriveCache>()('byPath')
  public static byDrivewsid = m.Lens.fromProp<ICloudDriveCache>()('byDrivewsid')
  // export const update = byPath.compose(byDrivewsid)
}

export const cachef = (): ICloudDriveCache => ({
  // byPath: {},
  byDrivewsid: {},
  // root: O.none,
})

// const getCachedHierarchyByIdRecursive = (
//   drivewsid: string,
// ) =>
//   (cache: ICloudDriveCache): E.Either<Error, Hierarchy> => {
//     return pipe(
//       E.Do,
//       E.bind('item', () => this.getFolderByIdE(drivewsid)),
//       E.bind('path', () => this.getCachedPathForIdE(drivewsid)),
//       E.bind('result', ({ item }) =>
//         isRootCacheEntity(item)
//           ? E.of<Error, Hierarchy>([{ drivewsid: rootDrivewsid }])
//           : pipe(
//             getCachedHierarchyByIdRecursive(item.content.parentId)(cache),
//             E.map((
//               h,
//             ): Hierarchy => [...h, {
//               drivewsid: item.content.drivewsid,
//               name: item.content.name,
//               etag: item.content.etag,
//             }]),
//           )),
//       E.map(_ => _.result),
//     )
//   }

const getHierarchyById = (drivewsid: string) =>
  (cache: ICloudDriveCache): E.Either<Error, Hierarchy> => {
    const h: Hierarchy = []

    let item = pipe(
      cache.byDrivewsid,
      R.lookup(drivewsid),
    )

    while (O.isSome(item)) {
      if (isRootCacheEntity(item.value)) {
        h.push({ drivewsid: rootDrivewsid })
        return E.right(A.reverse(h))
      }
      else {
        h.push({
          drivewsid,
          etag: item.value.content.etag,
          name: item.value.content.name,
          extension: item.value.content.extension,
        })
        item = pipe(
          cache.byDrivewsid,
          R.lookup(item.value.content.parentId),
        )
      }
    }

    return E.left(error(`missing ${drivewsid} in cache`))
  }

const getCachedPathForId = (drivewsid: string) =>
  (cache: ICloudDriveCache): E.Either<Error, string> => {
    // if (drivewsid === rootDrivewsid) {
    //   return pipe(
    //     cache.root,
    //     O.map(constant('/')),
    //     E.fromOption(() => error('missing root in cache')),
    //   )
    // }

    return pipe(
      getHierarchyById(drivewsid)(cache),
      E.map(hierarchyToPath),
    )
  }

const getByPath = (path: string) =>
  (cache: ICloudDriveCache): E.Either<Error, ICloudDriveCacheEntity> => {
    const [, ...itemsNames] = parsePath(path)

    return pipe(
      itemsNames,
      A.reduce(
        pipe(cache.byDrivewsid, R.lookup(rootDrivewsid), E.fromOption(() => error(`missing root`))),
        (folder, itemName) =>
          pipe(
            E.Do,
            E.bind(
              'folder',
              () =>
                pipe(
                  folder,
                  E.filterOrElse(isFolderLikeCacheEntity, p => error(`${p.content.drivewsid} is not a folder`)),
                  E.filterOrElse(isDetailsCacheEntity, p => error(`${p.content.drivewsid} is missing details`)),
                ),
            ),
            E.bind('item', ({ folder }) =>
              pipe(
                folder.content.items,
                A.findFirst(item => fileName(item) === itemName),
                E.fromOption(() =>
                  error(`item "${itemName}" was not found in "${folder.content.name}" (${folder.content.drivewsid})`)
                ),
              )),
            E.chain(({ item }) =>
              pipe(
                cache,
                getById(item.drivewsid),
                E.fromOption(() => error(`missing ${item.drivewsid} in cache`)),
              )
            ),
          ),
      ),
    )
  }

export const isRootCacheEntity = (
  entity: ICloudDriveCacheEntity,
): entity is CacheEntityFolderRootDetails => entity.type === 'ROOT'

export const isFolderLikeCacheEntity = (
  entity: ICloudDriveCacheEntity,
): entity is CacheEntityFolder | CacheEntityAppLibrary => isFolderLikeType(entity.type)

export const isDetailsCacheEntity = (
  entity: ICloudDriveCacheEntity,
): entity is CacheEntityFolderRootDetails | CacheEntityFolderDetails | CacheEntityAppLibraryDetails =>
  isFolderLikeCacheEntity(entity) && entity.hasDetails

export const isFolderLikeType = (
  type: ICloudDriveCacheEntity['type'],
): type is (CacheEntityFolder | CacheEntityAppLibrary)['type'] => type !== 'FILE'

const cacheEntityFromDetails = (
  details: DriveDetails,
): ICloudDriveCacheEntity =>
  isRootDetails(details)
    ? new CacheEntityFolderRootDetails(details)
    : details.type === 'FOLDER'
    ? new CacheEntityFolderDetails(details)
    : new CacheEntityAppLibraryDetails(details)

const cacheEntityFromItem = (
  item: DriveChildrenItem,
): ICloudDriveCacheEntity => {
  return item.type === 'FILE'
    ? new CacheEntityFile(item)
    : item.type === 'FOLDER'
    ? new CacheEntityFolderItem(item)
    : new CacheEntityAppLibraryItem(item)
}

const getById = (drivewsid: string) =>
  (cache: ICloudDriveCache): O.Option<ICloudDriveCacheEntity> => {
    return pipe(cache.byDrivewsid, R.lookup(drivewsid))
  }

const addItems = (items: DriveChildrenItem[]) =>
  (cache: ICloudDriveCache): E.Either<Error, ICloudDriveCache> => {
    return pipe(
      items,
      A.reduce(E.of(cache), (acc, cur) => pipe(acc, E.chain(putItem(cur)))),
    )
  }

// const isEntityNewer = (
//   cached: ICloudDriveCacheEntity,
//   entity: ICloudDriveCacheEntity,
// ) => {
//   if (entity.type === 'FILE' || cached.type === 'FILE') {
//     return cached.content.etag !== entity.content.etag
//   }

//   if (!cached.hasDetails && entity.hasDetails) {
//     return true
//   }

//   return cached.content.etag !== entity.content.etag
// }

const putRoot = (
  details: DriveDetailsRoot,
): ((s: ICloudDriveCache) => E.Either<Error, ICloudDriveCache>) => {
  return flow(
    // lens.root.set(O.some(details)),
    lens.byDrivewsid.modify(
      R.upsertAt(rootDrivewsid, cacheEntityFromDetails(details)),
    ),
    // lens.byPath.modify(R.upsertAt('/', cacheEntityFromDetails(details))),
    addItems(details.items),
  )
}

const removeById = (drivewsid: string) =>
  (cache: ICloudDriveCache) =>
    pipe(
      cache,
      lens.byDrivewsid.modify(R.deleteAt(drivewsid)),
    )

const putDetails = (
  details: DriveDetails,
): ((cache: ICloudDriveCache) => E.Either<Error, ICloudDriveCache>) => {
  // if (isRootDetails(details)) {
  //   return (cache) => {
  //     if (O.isSome(cache.root)) {
  //       if (cache.root.value.etag === details.etag) {
  //         return E.of(cache)
  //       }
  //     }
  //     return putRoot(details)(cache)
  //   }
  // }

  cacheLogger.debug(`putting ${details.drivewsid} ${details.name} ${details.etag}`)

  return (cache) =>
    pipe(
      E.Do,
      // E.bind('parentPath', () =>
      //   pipe(
      //     getCachedPathForId(details.parentId)(cache),
      //     E.mapLeft(() =>
      //       MissingParentError.create(
      //         `Error putting ${details.drivewsid} (${details.name}) missing parent ${details.parentId} in cache`,
      //       )
      //     ),
      //   )),
      // E.bind('detailsPath', ({ parentPath }) => E.of(Path.join(parentPath, fileName(details)))),
      E.bind('entity', () => E.of(cacheEntityFromDetails(details))),
      // E.bind('wasUpdated', ({ entity }) =>
      //   E.of(
      //     pipe(
      //       cache,
      //       getById(entity.content.drivewsid),
      //       O.map((cached) => isEntityNewer(cached, entity)),
      //       O.fold(() => true, identity),
      //     ),
      //   )),
      E.chain(({ entity }) =>
        pipe(
          cache,
          // lens.byPath.modify(R.upsertAt(detailsPath, entity)),
          lens.byDrivewsid.modify(R.upsertAt(details.drivewsid, entity)),
          addItems(details.items),
        )
      ),
    )
}

const putItem = (
  item: DriveChildrenItem,
): ((cache: ICloudDriveCache) => E.Either<Error, ICloudDriveCache>) => {
  return (cache) =>
    pipe(
      E.Do,
      E.bind('parentPath', () =>
        pipe(
          cache,
          // logReturnAs('cache'),
          getCachedPathForId(item.parentId),
          E.mapLeft(() => MissingParentError.create(`putItem: missing parent ${item.parentId} in cache`)),
        )),
      E.bind('cachedEntity', () => E.of(pipe(cache, getById(item.drivewsid)))),
      E.bind('needsUpdate', ({ cachedEntity }) =>
        E.of(
          O.isNone(cachedEntity)
            || cachedEntity.value.content.etag !== item.etag
            || !cachedEntity.value.hasDetails,
        )),
      // E.map(logReturn(_ => cacheLogger.debug({ ..._, item }))),
      E.map(({ needsUpdate }) =>
        needsUpdate
          ? pipe(
            cache,
            // lens.byPath.modify(
            //   R.upsertAt(
            //     Path.join(parentPath, fileName(item)),
            //     cacheEntityFromItem(item),
            //   ),
            // ),
            lens.byDrivewsid.modify(
              R.upsertAt(item.drivewsid, cacheEntityFromItem(item)),
            ),
          )
          : cache
      ),
    )
}

const validateCacheJson = (json: unknown): json is ICloudDriveCache => {
  return isObjectWithOwnProperty(json, 'byDrivewsid')
}

export class Cache {
  private readonly cache: ICloudDriveCache

  static tryReadFromFile = (
    accountDataFilePath: string,
  ): TE.TaskEither<Error, ICloudDriveCache> => {
    return pipe(
      tryReadJsonFile(accountDataFilePath),
      TE.filterOrElseW(
        validateCacheJson,
        () => TypeDecodingError.create([], 'wrong ICloudDriveCache json'),
      ),
    )
  }

  static trySaveFile = (
    cache: Cache,
    cacheFilePath: string,
  ): TE.TaskEither<Error, void> => {
    return pipe(cache.cache, saveJson(cacheFilePath))
  }

  static trySaveFileF = (
    cacheFilePath: string,
  ) => {
    return (cache: Cache) => pipe(cache.cache, saveJson(cacheFilePath))
  }

  constructor(cache: ICloudDriveCache = cachef()) {
    this.cache = cache
  }

  public copy = (): Cache => Cache.create(this.cache)
  public get = () => this.cache

  putDetails = (details: DriveDetails): E.Either<Error, Cache> => {
    return pipe(this.cache, putDetails(details), E.map(Cache.create))
  }

  putRoot = (details: DriveDetailsRoot): E.Either<Error, Cache> => {
    return pipe(this.cache, putRoot(details), E.map(Cache.create))
  }

  putDetailss = (detailss: DriveDetails[]): E.Either<Error, Cache> => {
    return pipe(
      detailss,
      A.reduce(
        E.of<Error, Cache>(this),
        (cache, detail) => pipe(cache, E.chain(cache => cache.putDetails(detail))),
      ),
    )
  }

  putItem = (item: DriveChildrenItem): E.Either<Error, Cache> => {
    return pipe(this.cache, putItem(item), E.map(Cache.create))
  }

  getRoot = (): O.Option<E.Either<Error, CacheEntityFolderRootDetails>> => {
    return pipe(
      this.cache.byDrivewsid,
      R.lookup(rootDrivewsid),
      O.map(
        flow(E.fromPredicate(isRootCacheEntity, () => error('invalid root cache entity'))),
      ),
    )
  }

  getRootE = (): E.Either<Error, CacheEntityFolderRootDetails> => {
    return pipe(
      this.getRoot(),
      E.fromOption(() => error(`missing root entity in cache`)),
      E.flatten,
    )
  }

  getById = (drivewsid: string): O.Option<ICloudDriveCacheEntity> => {
    return pipe(
      pipe(this.cache.byDrivewsid, R.lookup(drivewsid)),
      logReturn(
        O.fold(
          () => cacheLogger.debug(`cache miss for ${drivewsid}`),
          _ => cacheLogger.debug(`cache hit for ${drivewsid} hasDetails: ${_.hasDetails}`),
        ),
      ),
    )
  }

  getByIds = (drivewsids: string[]): O.Option<ICloudDriveCacheEntity>[] => {
    return pipe(drivewsids, A.map(this.getById))
  }

  getByIdE = (drivewsid: string): E.Either<Error, ICloudDriveCacheEntity> => {
    return pipe(
      this.getById(drivewsid),
      E.fromOption(() => error(`missing ${drivewsid} in cache`)),
    )
  }

  getByIdWithPath = (drivewsid: string): O.Option<{ entity: ICloudDriveCacheEntity; path: string }> => {
    return pipe(
      O.Do,
      O.bind('entity', () => this.getById(drivewsid)),
      O.bind('path', () => this.getCachedPathForId(drivewsid)),
    )
  }

  getFolderById = (drivewsid: string) => {
    return pipe(
      this.getById(drivewsid),
      O.map(
        flow(
          E.fromPredicate(isFolderLikeCacheEntity, () => error(`${drivewsid} is not a folder`)),
        ),
      ),
    )
  }

  getFolderByPath = (
    drivewsid: string,
  ): E.Either<
    Error,
    | CacheEntityFolderRootDetails
    | CacheEntityFolderDetails
    | CacheEntityFolderItem
    | CacheEntityAppLibraryDetails
    | CacheEntityAppLibraryItem
  > => {
    return pipe(
      this.getByPathE(drivewsid),
      E.filterOrElse(isFolderLikeCacheEntity, () => error(`${drivewsid} is not a folder`)),
    )
  }

  getFolderByIdE = (drivewsid: string) => {
    return pipe(
      this.getByIdE(drivewsid),
      E.chain(flow(
        E.fromPredicate(isFolderLikeCacheEntity, () => error(`${drivewsid} is not a folder`)),
      )),
    )
  }

  getFolderDetailsById = (
    drivewsid: string,
  ): O.Option<
    E.Either<Error, CacheEntityFolderRootDetails | CacheEntityFolderDetails | CacheEntityAppLibraryDetails>
  > => {
    return pipe(
      this.getFolderById(drivewsid),
      O.chain(
        flow(E.fold(
          err => O.some(E.left(err)),
          flow(O.fromPredicate(isDetailsCacheEntity), O.map(E.of)),
        )),
      ),
    )
  }

  getFolderDetailsByIds = (
    drivewsids: string[],
  ) => {
    return pipe(
      drivewsids,
      A.map(id => pipe(this.getFolderDetailsById(id), E.fromOption(() => id))),
      A.separate,
      ({ left: missed, right: cached }) =>
        pipe(
          E.sequenceArray(cached),
          E.map((cached) => ({ missed, cached })),
        ),
    )
  }

  getCachedHierarchyByIdRecursive = (
    drivewsid: string,
  ): E.Either<Error, Hierarchy> => {
    return pipe(
      E.Do,
      E.bind('item', () => this.getFolderByIdE(drivewsid)),
      E.bind('path', () => this.getCachedPathForIdE(drivewsid)),
      E.bind('result', ({ item }) =>
        isRootCacheEntity(item)
          ? E.of<Error, Hierarchy>([{ drivewsid: rootDrivewsid }])
          : pipe(
            this.getCachedHierarchyByIdRecursive(item.content.parentId),
            E.map((
              h,
            ): Hierarchy => [...h, {
              drivewsid: item.content.drivewsid,
              name: item.content.name,
              etag: item.content.etag,
            }]),
          )),
      E.map(_ => _.result),
    )
  }

  getFolderByPathE = (path: string): E.Either<Error, CacheEntityFolder> => {
    return pipe(
      this.getByPathE(path),
      E.filterOrElse(isFolderLikeCacheEntity, () => error(`${path} is not folder`)),
    )
  }

  getByPathE = (path: string): E.Either<Error, ICloudDriveCacheEntity> => {
    return pipe(
      this.getByPath(path),
      E.fromOption(() => error(`missing ${path} in cache`)),
    )
  }

  getByPath = (path: string): O.Option<ICloudDriveCacheEntity> => {
    return pipe(
      this.cache,
      getByPath(path),
      O.fromEither,
      // this.cache.byPath,
      // R.lookup(normalizePath(path)),
      logReturn(
        O.fold(
          () => cacheLogger.debug(`cache miss for ${path}`),
          _ => cacheLogger.debug(`cache hit for ${path} hasDetails: ${_.hasDetails}`),
        ),
      ),
    )
  }

  getByIdU = (drivewsid: string): ICloudDriveCacheEntity | undefined => {
    return pipe(this.getById(drivewsid), O.toUndefined)
  }

  getByPathU = (path: string): ICloudDriveCacheEntity | undefined => {
    return pipe(this.getByPath(path), O.toUndefined)
  }

  getCachedPathForId = (drivewsid: string): O.Option<string> => {
    return pipe(getCachedPathForId(drivewsid)(this.cache), O.fromEither)
  }

  getCachedPathForIdE = (drivewsid: string): E.Either<Error, string> => {
    return pipe(
      getCachedPathForId(drivewsid)(this.cache),
      // E.fromOption(() => error(`missing ${drivewsid} in cache`)),
    )
  }

  removeById = (drivewsid: string): Cache => pipe(this.cache, removeById(drivewsid), Cache.create)

  removeByIds = (drivewsids: string[]): Cache =>
    pipe(
      drivewsids,
      A.reduce(this.cache, (cache, cur) => removeById(cur)(cache)),
      Cache.create,
    )

  // findByPathGlob = (path: string): [string, ICloudDriveCacheEntity][] => {
  //   const npath = normalizePath(path)
  //   return pipe(
  //     this.cache.byPath,
  //     R.filterWithIndex(
  //       (path) => path == npath || path.startsWith(npath + '/'),
  //     ),
  //     R.toArray,
  //   )
  // }

  // , includeDescendors = true
  // removeByPath = (path: string): Cache => {
  //   return pipe(
  //     this.findByPathGlob(path),
  //     A.reduce(this.cache, (cache, [path, entity]) =>
  //       pipe(
  //         cache,
  //         // lens.byPath.modify(R.deleteAt(path)),
  //         lens.byDrivewsid.modify(R.deleteAt(entity.content.drivewsid)),
  //       )),
  //     Cache.create,
  //   )
  // }

  static create(cache: ICloudDriveCache = cachef()): Cache {
    return new Cache(cache)
  }

  static fromRootDetails(rootDetails: DriveDetailsRoot): Cache {
    return new Cache({
      // root: O.some(rootDetails),
      byDrivewsid: {
        [rootDetails.drivewsid as string]: cacheEntityFromDetails(rootDetails),
      },
      // byPath: {
      //   '/': cacheEntityFromDetails(rootDetails),
      // },
    })
  }
}
