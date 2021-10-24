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
import { cacheLogger, logger, logReturn } from '../../../lib/logging'
import { hasOwnProperty, isObjectWithOwnProperty } from '../../../lib/util'
import { fileName, normalizePath } from '../helpers'
import {
  DriveChildrenItem,
  DriveDetails,
  DriveDetailsRoot,
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
  CacheEntityFolderRoot,
  ICloudDriveCache,
  ICloudDriveCacheEntity,
} from './types'

class lens {
  public static root = m.Lens.fromProp<ICloudDriveCache>()('root')
  public static byPath = m.Lens.fromProp<ICloudDriveCache>()('byPath')
  public static byDrivewsid = m.Lens.fromProp<ICloudDriveCache>()('byDrivewsid')
  // export const update = byPath.compose(byDrivewsid)
}

export const cachef = (): ICloudDriveCache => ({
  byPath: {},
  byDrivewsid: {},
  root: O.none,
})

const getCachedPathForId = (drivewsid: string) =>
  (cache: ICloudDriveCache): O.Option<string> => {
    if (drivewsid === rootDrivewsid) {
      return pipe(cache.root, O.map(constant('/')))
    }

    // logger.debug({
    //   byPath: cache.byPath['/Obsidian/copy1/.obsidian'],
    // })

    return pipe(
      R.toArray(cache.byPath),
      A.findFirst(([, entity]) => entity.content.drivewsid === drivewsid),
      O.map(fst),
    )
  }

export const isRootCacheEntity = (
  entity: ICloudDriveCacheEntity,
): entity is CacheEntityFolderRoot => entity.type === 'ROOT'

export const isFolderLikeCacheEntity = (
  entity: ICloudDriveCacheEntity,
): entity is CacheEntityFolder | CacheEntityAppLibrary => isFolderLikeType(entity.type)

export const isDetailsCacheEntity = (
  entity: ICloudDriveCacheEntity,
): entity is CacheEntityFolderRoot | CacheEntityFolderDetails | CacheEntityAppLibraryDetails =>
  isFolderLikeCacheEntity(entity) && entity.hasDetails

export const isFolderLikeType = (
  type: ICloudDriveCacheEntity['type'],
): type is (CacheEntityFolder | CacheEntityAppLibrary)['type'] => type !== 'FILE'

const cacheEntityFromDetails = (
  details: DriveDetails,
): ICloudDriveCacheEntity =>
  isRootDetails(details)
    ? new CacheEntityFolderRoot(details)
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

const isEntityNewer = (
  cached: ICloudDriveCacheEntity,
  entity: ICloudDriveCacheEntity,
) => {
  if (entity.type === 'FILE' || cached.type === 'FILE') {
    return cached.content.etag !== entity.content.etag
  }

  if (!cached.hasDetails && entity.hasDetails) {
    return true
  }

  return cached.content.etag !== entity.content.etag
}

const putRoot = (
  details: DriveDetailsRoot,
): ((s: ICloudDriveCache) => E.Either<Error, ICloudDriveCache>) => {
  return flow(
    lens.root.set(O.some(details)),
    lens.byDrivewsid.modify(
      R.upsertAt(rootDrivewsid, cacheEntityFromDetails(details)),
    ),
    lens.byPath.modify(R.upsertAt('/', cacheEntityFromDetails(details))),
    addItems(details.items),
  )
}

const putDetails = (
  details: DriveDetails,
): ((cache: ICloudDriveCache) => E.Either<Error, ICloudDriveCache>) => {
  if (isRootDetails(details)) {
    return (cache) => {
      if (O.isSome(cache.root)) {
        if (cache.root.value.etag === details.etag) {
          return E.of(cache)
        }
      }
      return putRoot(details)(cache)
    }
  }

  return (cache) =>
    pipe(
      E.Do,
      E.bind('parentPath', () =>
        pipe(
          getCachedPathForId(details.parentId)(cache),
          E.fromOption(() =>
            MissingParentError.create(
              `Error putting ${details.drivewsid} (${details.name}) missing parent ${details.parentId} in cache`,
            )
          ),
        )),
      E.bind('detailsPath', ({ parentPath }) => E.of(Path.join(parentPath, fileName(details)))),
      E.bind('entity', () => E.of(cacheEntityFromDetails(details))),
      E.bind('updated', ({ entity }) =>
        E.of(
          pipe(
            cache,
            getById(entity.content.drivewsid),
            O.map((cached) => isEntityNewer(cached, entity)),
            O.fold(() => true, identity),
          ),
        )),
      E.chain(({ entity, detailsPath, updated }) =>
        updated
          ? pipe(
            cache,
            lens.byPath.modify(R.upsertAt(detailsPath, entity)),
            lens.byDrivewsid.modify(R.upsertAt(details.drivewsid, entity)),
            addItems(details.items),
          )
          : E.of(cache)
      ),
    )
}

const putItem = (
  item: DriveChildrenItem,
): ((cache: ICloudDriveCache) => E.Either<Error, ICloudDriveCache>) => {
  return (cache) =>
    pipe(
      cache,
      getCachedPathForId(item.parentId),
      E.fromOption(() => MissingParentError.create(`missing parent ${item.parentId} in cache`)),
      E.map((parentPath) =>
        pipe(
          cache,
          lens.byPath.modify(
            R.upsertAt(
              Path.join(parentPath, fileName(item)),
              cacheEntityFromItem(item),
            ),
          ),
          lens.byDrivewsid.modify(
            R.upsertAt(item.drivewsid, cacheEntityFromItem(item)),
          ),
        )
      ),
    )
}

const validateCacheJson = (json: unknown): json is ICloudDriveCache => {
  return isObjectWithOwnProperty(json, 'byPath') && hasOwnProperty(json, 'root')
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

  constructor(cache: ICloudDriveCache = cachef()) {
    this.cache = cache
  }

  public copy = (): Cache => Cache.create(this.cache)

  putDetails = (details: DriveDetails): E.Either<Error, Cache> => {
    return pipe(this.cache, putDetails(details), E.map(Cache.create))
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

  getRoot = (): O.Option<E.Either<Error, CacheEntityFolderRoot>> => {
    return pipe(
      this.cache.byDrivewsid,
      R.lookup(rootDrivewsid),
      O.map(
        flow(E.fromPredicate(isRootCacheEntity, () => error('invalid root cache entity'))),
      ),
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
  ): O.Option<E.Either<Error, CacheEntityFolderRoot | CacheEntityFolderDetails | CacheEntityAppLibraryDetails>> => {
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

  getByPath = (path: string): O.Option<ICloudDriveCacheEntity> => {
    return pipe(
      this.cache.byPath,
      R.lookup(normalizePath(path)),
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
    return getCachedPathForId(drivewsid)(this.cache)
  }

  getCachedPathForIdE = (drivewsid: string): E.Either<Error, string> => {
    return pipe(
      getCachedPathForId(drivewsid)(this.cache),
      E.fromOption(() => error(`missing ${drivewsid} in cache`)),
    )
  }

  findByPathGlob = (path: string): [string, ICloudDriveCacheEntity][] => {
    const npath = normalizePath(path)
    return pipe(
      this.cache.byPath,
      R.filterWithIndex(
        (path) => path == npath || path.startsWith(npath + '/'),
      ),
      R.toArray,
    )
  }

  // , includeDescendors = true
  removeByPath = (path: string): Cache => {
    return pipe(
      this.findByPathGlob(path),
      A.reduce(this.cache, (cache, [path, entity]) =>
        pipe(
          cache,
          lens.byPath.modify(R.deleteAt(path)),
          lens.byDrivewsid.modify(R.deleteAt(entity.content.drivewsid)),
        )),
      Cache.create,
    )
  }

  static create(cache: ICloudDriveCache = cachef()): Cache {
    return new Cache(cache)
  }
}
