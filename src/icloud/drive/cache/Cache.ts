import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import * as R from 'fp-ts/lib/Record'
import * as TE from 'fp-ts/lib/TaskEither'
import { NormalizedPath } from '../../../cli/cli-drive/cli-drive-actions/helpers'
import { err, TypeDecodingError } from '../../../lib/errors'
import { tryReadJsonFile } from '../../../lib/files'
import { saveJson } from '../../../lib/json'
import { cacheLogger, logger, logReturn } from '../../../lib/logging'
import { MissinRootError } from '../errors'
import { parsePath } from '../helpers'
import {
  asOption,
  Details,
  DetailsRoot,
  DriveChildrenItem,
  fileName,
  Hierarchy,
  invalidId,
  MaybeNotFound,
  Root,
} from '../types'
import { rootDrivewsid, trashDrivewsid } from '../types-io'
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
  isTrashCacheEntity,
  PartialValidPath,
  putDetails,
  putItem,
  putRoot,
  removeById,
  validateCacheJson,
} from './cachef'
import { HierarchyResult } from './GetByPathResultValid'
import {
  CacheEntity,
  CacheEntityAppLibrary,
  CacheEntityAppLibraryDetails,
  CacheEntityFolderDetails,
  CacheEntityFolderLike as CacheEntityFolderLike,
  CacheEntityFolderRootDetails,
  CacheEntityFolderTrashDetails,
  CacheF,
} from './types'
import { getPartialValidPathV2 } from './v2'

export class Cache {
  private readonly cache: CacheF

  static tryReadFromFile = (
    accountDataFilePath: string,
  ): TE.TaskEither<Error, CacheF> => {
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

  constructor(cache: CacheF = cachef()) {
    this.cache = cache
  }

  public copy = (): Cache => Cache.create(this.cache)
  public get = () => this.cache

  putDetails = (details: Details): E.Either<Error, Cache> => {
    return pipe(this.cache, putDetails(details), E.map(Cache.create))
  }

  putRoot = (details: DetailsRoot): E.Either<Error, Cache> => {
    return pipe(this.cache, putRoot(details), E.map(Cache.create))
  }

  putDetailss = <D extends Details>(detailss: D[]): E.Either<Error, Cache> => {
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

  getTrashE = (): E.Either<Error, CacheEntityFolderTrashDetails> => {
    return pipe(
      this.getByIdE(trashDrivewsid),
      E.filterOrElse(isTrashCacheEntity, () => err(`invalid trash details`)),
      // E.fromOption(() => MissinRootError.create(`missing root entity in cache`)),
      // E.flatten,
    )
  }

  getById = (drivewsid: string): O.Option<CacheEntity> => {
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

  getByIds = (drivewsids: string[]): O.Option<CacheEntity>[] => {
    return pipe(drivewsids, A.map(this.getById))
  }

  getByIdE = (drivewsid: string): E.Either<Error, CacheEntity> => {
    return pipe(
      this.getById(drivewsid),
      E.fromOption(() => err(`missing ${drivewsid} in cache`)),
    )
  }

  getByIdWithPath = (drivewsid: string): O.Option<{ entity: CacheEntity; path: string }> => {
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
          E.fromPredicate(isFolderLikeCacheEntity, () => err(`getFolderById: ${drivewsid} is not a folder`)),
        ),
      ),
    )
  }

  getFolderByPathE = (
    path: NormalizedPath,
  ): E.Either<Error, CacheEntityFolderLike | CacheEntityAppLibrary> =>
    pipe(
      this.getByPathE(path),
      E.filterOrElse(isFolderLikeCacheEntity, () => err(`getFolderByPathE: ${path} is not a folder`)),
    )

  getFolderByIdE = (drivewsid: string) => {
    return pipe(
      this.getByIdE(drivewsid),
      E.chain(flow(
        E.fromPredicate(isFolderLikeCacheEntity, () => err(`getFolderByIdE: ${drivewsid} is not a folder`)),
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
  ): E.Either<Error, MaybeNotFound<Details>[]> => {
    return pipe(
      drivewsids,
      A.map(id => this.getFolderDetailsById(id)),
      A.map(O.fold(() => E.right<Error, MaybeNotFound<Details>>(invalidId), E.map(v => v.content))),
      E.sequenceArray,
      E.map(RA.toArray),
    )
  }

  getFolderDetailsByIdsO = (
    drivewsids: string[],
  ): E.Either<Error, O.Option<Details>[]> =>
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
        E.bind('result', ({ item }) =>
          isRootCacheEntity(item)
            ? E.of<Error, Hierarchy>([{ drivewsid: rootDrivewsid }])
            : isTrashCacheEntity(item)
            ? E.of<Error, Hierarchy>([{ drivewsid: trashDrivewsid }])
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

  getByPathE = (path: NormalizedPath): E.Either<Error, CacheEntity> => {
    return pipe(
      this.getByPath(path),
      E.fromOption(() => err(`missing ${path} in cache`)),
    )
  }

  getByPathV = (path: NormalizedPath): PartialValidPath => {
    const parts = parsePath(path)
    const rest = pipe(parts, A.dropLeft(1))

    return pipe(
      E.Do,
      E.bind('root', () => pipe(this.cache, getRoot())),
      E.fold(
        (e): PartialValidPath => ({ valid: false, error: e, rest: parts, validPart: [] }),
        ({ root }) =>
          pipe(
            this.cache,
            getPartialValidPath(rest, root),
          ),
      ),
    )
  }

  getByPathVER = <R extends Root>(
    root: Root,
    path: NormalizedPath,
  ): E.Either<Error, HierarchyResult<R>> => {
    const parts = parsePath(path)
    const rest = pipe(parts, A.dropLeft(1))

    return pipe(
      E.Do,
      E.bind('root', () => E.of(root)),
      E.map(({ root }) =>
        pipe(
          this.cache,
          getPartialValidPathV2(rest, root),
          v => v as HierarchyResult<R>,
        )
      ),
    )
  }

  getByPathVE = <R extends Root>(
    path: NormalizedPath,
  ): E.Either<Error, HierarchyResult<R>> => {
    const parts = parsePath(path)
    const rest = pipe(parts, A.dropLeft(1))

    return pipe(
      E.Do,
      E.bind('root', () => pipe(this.cache, getRoot())),
      E.map(({ root }) =>
        pipe(
          this.cache,
          getPartialValidPathV2(rest, root.content),
          v => v as HierarchyResult<R>,
        )
      ),
    )
  }

  getByPathV2 = (
    path: NormalizedPath,
  ):
    | { validPart: CacheEntityFolderLike[]; rest: NA.NonEmptyArray<string> }
    | { validPart: NA.NonEmptyArray<CacheEntity>; rest: [] } =>
  {
    return pipe(
      this.getByPathV(path),
      _ =>
        _.valid
          ? { validPart: _.entities, rest: [] }
          : { validPart: _.validPart, rest: _.rest },
    )
  }

  getByPath = (path: string): O.Option<CacheEntity> => {
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

  getByIdU = (drivewsid: string): CacheEntity | undefined => {
    return pipe(this.getById(drivewsid), O.toUndefined)
  }

  getByPathU = (path: string): CacheEntity | undefined => {
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
  static create(cache: CacheF = cachef()): Cache {
    return new Cache(cache)
  }

  static fromRootDetails(rootDetails: DetailsRoot): Cache {
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
    const M = R.getMonoid({ concat: (a: CacheEntity, b: CacheEntity) => b })

    // cacheLogger.debug(`concat ${JSON.stringify(a.get())}`)
    // cacheLogger.debug(`concat ${JSON.stringify(b.get())}`)
    return Cache.create(
      { byDrivewsid: M.concat(a.get().byDrivewsid, b.get().byDrivewsid) },
    )
  }

  static semigroup = Cache
}
