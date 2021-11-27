import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import * as R from 'fp-ts/lib/Record'
import * as TE from 'fp-ts/lib/TaskEither'
import { err, TypeDecodingError } from '../../../lib/errors'
import { tryReadJsonFile } from '../../../lib/files'
import { saveJson } from '../../../lib/json'
import { cacheLogger, logger, logReturn } from '../../../lib/logging'
import { MissinRootError } from '../errors'
import { fileName, parsePath } from '../helpers'
import {
  asOption,
  DriveChildrenItem,
  DriveDetails,
  DriveDetailsAppLibrary,
  DriveDetailsFolder,
  DriveDetailsRoot,
  Hierarchy,
  invalidId,
  MaybeNotFound,
} from '../types'
import { rootDrivewsid } from '../types-io'
import {
  cacheEntityFromDetails,
  cachef,
  getByPath,
  getCachedPathForId,
  getPartialValidPath,
  getRoot,
  isDetailsCacheEntity,
  isFolderLikeCacheEntity,
  isRootCacheEntity,
  PartialValidPath,
  putDetails,
  putItem,
  putRoot,
  removeById,
  validateCacheJson,
} from './cachef'
import {
  CacheEntityAppLibrary,
  CacheEntityAppLibraryDetails,
  CacheEntityFolderDetails,
  CacheEntityFolderLike as CacheEntityFolderLike,
  CacheEntityFolderRootDetails,
  ICloudDriveCache,
  ICloudDriveCacheEntity,
} from './types'

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

  putDetailss = <D extends DriveDetails>(detailss: D[]): E.Either<Error, Cache> => {
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

  putItems = (items: DriveChildrenItem[]): E.Either<Error, Cache> => {
    return pipe(
      items,
      A.reduce(
        E.of<Error, Cache>(this),
        (cache, detail) => pipe(cache, E.chain(cache => cache.putItem(detail))),
      ),
    )
  }

  getRoot = (): O.Option<E.Either<Error, CacheEntityFolderRootDetails>> => {
    return pipe(
      this.cache.byDrivewsid,
      R.lookup(rootDrivewsid),
      O.map(
        flow(E.fromPredicate(isRootCacheEntity, () => err('invalid root cache entity'))),
      ),
    )
  }

  getRootE = (): E.Either<Error, CacheEntityFolderRootDetails> => {
    return pipe(
      this.getRoot(),
      E.fromOption(() => MissinRootError.create(`missing root entity in cache`)),
      E.flatten,
    )
  }

  getById = (drivewsid: string): O.Option<ICloudDriveCacheEntity> => {
    return pipe(
      pipe(this.cache.byDrivewsid, R.lookup(drivewsid)),
      logReturn(
        O.fold(
          () => cacheLogger.debug(`cache miss for ${drivewsid}`),
          _ => cacheLogger.debug(`cache hit for ${drivewsid} (${fileName(_.content)}) hasDetails: ${_.hasDetails}`),
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
      E.fromOption(() => err(`missing ${drivewsid} in cache`)),
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
          E.fromPredicate(isFolderLikeCacheEntity, () => err(`${drivewsid} is not a folder`)),
        ),
      ),
    )
  }

  getFolderByPathE = (
    drivewsid: string,
  ): E.Either<Error, CacheEntityFolderLike | CacheEntityAppLibrary> =>
    pipe(
      this.getByPathE(drivewsid),
      E.filterOrElse(isFolderLikeCacheEntity, () => err(`${drivewsid} is not a folder`)),
    )

  // getFolderByPath = (
  //   drivewsid: string,
  // ) =>
  //   pipe(
  //     this.getByPath(drivewsid),
  //     O.map(E.filterOrElse(isFolderLikeCacheEntity, () => error(`${drivewsid} is not a folder`))),
  //   )
  getFolderByIdE = (drivewsid: string) => {
    return pipe(
      this.getByIdE(drivewsid),
      E.chain(flow(
        E.fromPredicate(isFolderLikeCacheEntity, () => err(`${drivewsid} is not a folder`)),
      )),
    )
  }

  getFolderDetailsById = (
    drivewsid: string,
  ): O.Option<
    E.Either<Error, CacheEntityFolderRootDetails | CacheEntityFolderDetails | CacheEntityAppLibraryDetails>
  > =>
    pipe(
      this.getFolderById(drivewsid),
      O.chain(
        flow(E.fold(
          err => O.some(E.left(err)),
          flow(O.fromPredicate(isDetailsCacheEntity), O.map(E.of)),
        )),
      ),
    )

  getFolderDetailsByIds = (
    drivewsids: string[],
  ): E.Either<Error, MaybeNotFound<DriveDetails>[]> => {
    return pipe(
      drivewsids,
      A.map(id => this.getFolderDetailsById(id)),
      A.map(O.fold(() => E.right<Error, MaybeNotFound<DriveDetails>>(invalidId), E.map(v => v.content))),
      E.sequenceArray,
      E.map(RA.toArray),
    )
  }

  getFolderDetailsByIdsO = (
    drivewsids: string[],
  ): E.Either<Error, O.Option<DriveDetailsRoot | DriveDetailsFolder | DriveDetailsAppLibrary>[]> =>
    pipe(
      this.getFolderDetailsByIds(drivewsids),
      E.map(A.map(asOption)),
    )

  getFolderDetailsByIdsSeparated = (
    drivewsids: string[],
  ): E.Either<
    Error,
    {
      missed: string[]
      cached: readonly (CacheEntityFolderRootDetails | CacheEntityFolderDetails | CacheEntityAppLibraryDetails)[]
    }
  > =>
    pipe(
      drivewsids,
      A.map(id => pipe(this.getFolderDetailsById(id), E.fromOption(() => id))),
      A.separate,
      ({ left: missed, right: cached }) =>
        pipe(
          E.sequenceArray(cached),
          E.map((cached) => ({ missed, cached })),
        ),
    )

  getCachedHierarchyById = (
    drivewsid: string,
  ): E.Either<Error, Hierarchy> => {
    const go = (drivewsid: string): E.Either<Error, Hierarchy> =>
      pipe(
        E.Do,
        E.bind('item', () => this.getByIdE(drivewsid)),
        // E.bind('path', () => this.getCachedPathForIdE(drivewsid)),
        E.bind('result', ({ item }) =>
          isRootCacheEntity(item)
            ? E.of<Error, Hierarchy>([{ drivewsid: rootDrivewsid }])
            : pipe(
              go(item.content.parentId),
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

    return pipe(
      go(drivewsid),
      E.map(flow(A.dropRight(1))),
    )
  }

  getByPathE = (path: string): E.Either<Error, ICloudDriveCacheEntity> => {
    return pipe(
      this.getByPath(path),
      E.fromOption(() => err(`missing ${path} in cache`)),
    )
  }

  getByPathV = (path: string): PartialValidPath => {
    const rest = pipe(path, parsePath, A.dropLeft(1))

    return pipe(
      E.Do,
      E.bind('root', () => pipe(this.cache, getRoot())),
      E.fold(
        (e): PartialValidPath => ({
          valid: false,
          error: e,
          rest: ['/', ...rest],
          validPart: [],
        }),
        ({ root }) =>
          pipe(
            this.cache,
            getPartialValidPath(rest, root),
          ),
      ),
    )
  }

  getByPathV2 = (path: string): PartialValidPath => {
    const rest = pipe(path, parsePath, A.dropLeft(1))

    return pipe(
      E.Do,
      E.bind('root', () => pipe(this.cache, getRoot())),
      E.fold(
        (e): PartialValidPath => ({
          valid: false,
          error: e,
          rest: ['/', ...rest],
          validPart: [],
        }),
        ({ root }) =>
          pipe(
            this.cache,
            getPartialValidPath(rest, root),
          ),
      ),
    )
  }

  getByPath = (path: string): O.Option<ICloudDriveCacheEntity> => {
    return pipe(
      this.cache,
      logReturn(() => logger.debug('getByPath')),
      getByPath(path),
      // E.fold(e => NotFoundError.is(e) ? O.none:)
      logReturn((v) => logger.debug(v._tag)),
      O.getRight,
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

  static concat(a: Cache, b: Cache): Cache {
    const M = R.getMonoid({ concat: (a: ICloudDriveCacheEntity, b: ICloudDriveCacheEntity) => b })

    // cacheLogger.debug(`concat ${JSON.stringify(a.get())}`)
    // cacheLogger.debug(`concat ${JSON.stringify(b.get())}`)
    return Cache.create(
      { byDrivewsid: M.concat(a.get().byDrivewsid, b.get().byDrivewsid) },
    )
  }

  static semigroup = Cache
}
