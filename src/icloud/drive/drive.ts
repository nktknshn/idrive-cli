import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { constVoid, flow, hole, Lazy, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import { Predicate } from 'fp-ts/lib/Predicate'
import { snd } from 'fp-ts/lib/ReadonlyTuple'
import * as TE from 'fp-ts/lib/TaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import { get } from 'spectacles-ts'
import { Readable } from 'stream'
import { error } from '../../lib/errors'
import { cacheLogger, logReturn, logReturnAs } from '../../lib/logging'
import { Cache, isFolderLikeCacheEntity, isFolderLikeType, isRootCacheEntity } from './cache/cachef'
import { CacheEntityAppLibrary, CacheEntityFolder, ICloudDriveCacheEntity } from './cache/types'
import { DriveApi } from './drive-api'
import { fileName, parsePath, splitParent } from './helpers'
import { getFolderRecursive } from './recursive'
import { getUrlStream } from './requests/download'
import {
  DriveChildrenItem,
  DriveChildrenItemFile,
  DriveChildrenItemFolder,
  DriveDetails,
  DriveDetailsFolder,
  DriveDetailsRoot,
  DriveFolderLike,
  isFile,
  isFolderDetails,
  isFolderLike,
  isFolderLikeItem,
  isRootDetails,
  partitionFoldersFiles,
  RecursiveFolder,
  rootDrivewsid,
} from './types'
import { WasFolderChanged } from './update'

const predicate = <B>(pred: boolean, onFalse: Lazy<B>, onTrue: Lazy<B>) => {
  if (pred) {
    return onTrue()
  }

  return onFalse()
}

export class Drive {
  private cache: Cache
  private api: DriveApi

  constructor(api: DriveApi, cache: Cache = Cache.create()) {
    this.cache = cache
    this.api = api
  }

  public static create(api: DriveApi, cache: Cache = Cache.create()): Drive {
    return new Drive(api, cache)
  }

  public getRoot = (
    cache = this.cache,
  ): TE.TaskEither<Error, DriveDetailsRoot> => {
    return pipe(
      this.cachingRetrieveItemDetailsInFolder(rootDrivewsid, cache),
      TE.filterOrElseW(isRootDetails, () => error(`invalid root details`)),
    )
  }

  private cachingRetrieveItemDetailsInFolders = (
    drivewsids: string[],
    cache = this.cache,
  ) => {
    return pipe(
      drivewsids,
      A.map(id => pipe(cache.getFolderDetailsById(id), E.fromOption(() => id))),
      A.separate,
      logReturn(({ left, right }) => cacheLogger.debug(`${left.length} missed caches (${left}), ${right.length} hits`)),
      ({ left, right: cached }) =>
        pipe(
          TE.Do,
          TE.bind('cached', () => TE.fromEither(E.sequenceArray(cached))),
          TE.bind('details', () =>
            left.length > 0
              ? this.api.retrieveItemDetailsInFolders(left)
              : TE.of([])),
          TE.bind('cache', ({ details }) => pipe(this.cache.putDetailss(details), TE.fromEither)),
          TE.chainFirstW(({ cache }) => this.cacheSet(cache)),
          TE.map(
            ({ cached, details }) => pipe([...cached.map(_ => _.content)], A.concat(details)),
          ),
        ),
    )
  }

  private cachingRetrieveItemDetailsInFolder = (
    drivewsid: string,
    cache = this.cache,
  ) => {
    return pipe(
      this.cachingRetrieveItemDetailsInFolders([drivewsid], cache),
      TE.map(ds => ds[0]),
    )
  }

  public getByPath = (
    path: string,
    cache = this.cache,
  ): TE.TaskEither<Error, DriveDetails | DriveChildrenItemFile> => {
    return pipe(
      this.getItemByPath(path),
      TE.chain(item =>
        isFolderLike(item)
          ? this.cachingRetrieveItemDetailsInFolder(item.drivewsid, cache)
          : TE.of<Error, DriveDetails | DriveChildrenItemFile>(item)
      ),
    )
  }

  public getFolderRecursiveByPath = (
    path: string,
    { depth }: { depth: number },
  ): TE.TaskEither<Error, RecursiveFolder> => getFolderRecursive(this, path, depth)

  public getItemByPath = (
    path: string,
    cache = this.cache,
  ): TE.TaskEither<Error, DriveDetails | DriveChildrenItem> => {
    const [, ...parsedPath] = parsePath(path)

    return pipe(
      parsedPath,
      A.reduce(
        pipe(
          this.getRoot(),
          TE.map(_ => _ as DriveDetails | DriveChildrenItem),
        ),
        (parent, itemName) =>
          pipe(
            TE.Do,
            TE.bind('parent', () =>
              pipe(
                parent,
                TE.filterOrElse(isFolderDetails, p => error(`${p.drivewsid} is not a folder`)),
              )),
            TE.bind('item', ({ parent }) =>
              pipe(
                parent.items,
                A.findFirst(item => itemName == fileName(item)),
                TE.fromOption(() =>
                  error(`item "${itemName}" was not found in "${parent.name}" (${parent.drivewsid})`)
                ),
              )),
            TE.chain(
              // 'result',
              ({ item }): TE.TaskEither<Error, DriveDetails | DriveChildrenItem> => isFile(item)
                ? TE.of(item)
                : this.cachingRetrieveItemDetailsInFolder(item.drivewsid, cache),
            ),
            // TE.map(_ => _.result),
          ),
      ),
    )
  }

  public getFolderByPath = (path: string): TE.TaskEither<Error, DriveDetails> => {
    return pipe(
      this.getByPath(path),
      TE.filterOrElse(isFolderDetails, () => error(`is not folder`)),
    )
  }

  public getFoldersByIds = (drivewsids: string[]): TE.TaskEither<Error, DriveDetails[]> => {
    return pipe(
      this.cachingRetrieveItemDetailsInFolders(drivewsids),
    )
  }

  public getPathsForIds = (drivewsids: string[]): TE.TaskEither<Error, DriveDetails[]> => {
    return pipe(
      this.cachingRetrieveItemDetailsInFolders(drivewsids),
    )
  }

  public wasAnythingChangedInFolder = (
    drivewsid: string,
    wasChangedF: (cached: CacheEntityFolder | CacheEntityAppLibrary, actual: DriveDetails) => WasFolderChanged,
  ): TE.TaskEither<Error, WasFolderChanged> => {
    return pipe(
      TE.Do,
      TE.bind('cached', () =>
        pipe(
          this.cache.getById(drivewsid),
          TE.fromOption(() => error(`missing ${drivewsid} in cache`)),
          TE.filterOrElse(isFolderLikeCacheEntity, () => error(`is not folder`)),
          // TE.chain(TE.fromEither),
        )),
      TE.bind('actual', () =>
        pipe(
          this.api.retrieveItemDetailsInFolder(drivewsid),
          // TE.fromOption(() => error(`missing root in cache`)),
        )),
      TE.map(({ cached, actual }) => wasChangedF(cached, actual)),
    )
  }

  public wasAnythingChangedInFolderHierarchy = (
    drivewsid: string,
    wasChangedF: (cached: CacheEntityFolder | CacheEntityAppLibrary, actual: DriveDetails) => WasFolderChanged,
  ): TE.TaskEither<Error, WasFolderChanged> => {
    return pipe(
      TE.Do,
      TE.bind('cached', () =>
        pipe(
          this.cache.getById(drivewsid),
          TE.fromOption(() => error(`missing ${drivewsid} in cache`)),
          TE.filterOrElse(isFolderLikeCacheEntity, () => error(`is not folder`)),
          // TE.chain(TE.fromEither),
        )),
      TE.bind('actual', () =>
        pipe(
          this.api.retrieveItemDetailsInFolder(drivewsid),
          // TE.fromOption(() => error(`missing root in cache`)),
        )),
      TE.map(({ cached, actual }) => wasChangedF(cached, actual)),
    )
  }

  public updateCachedEntityByPath = (
    path: string,
  ): TE.TaskEither<Error, DriveDetails> => {
    return pipe(
      this.cache.getByPath(path),
      TE.fromOption(() => error(`missing cached path ${path}`)),
      TE.chain(this.updateCachedEntity),
    )
  }

  public updateCachedEntityById = (
    drivewsid: string,
  ): TE.TaskEither<Error, DriveDetails> => {
    return pipe(
      this.cache.getById(drivewsid),
      TE.fromOption(() => error(`missing cached ${drivewsid}`)),
      TE.chain(this.updateCachedEntity),
    )
  }

  public updateCachedEntity = (
    enity: ICloudDriveCacheEntity,
  ): TE.TaskEither<Error, DriveDetails> => {
    return pipe(
      this.api.retrieveItemDetailsInFolder(
        enity.type === 'FILE'
          ? enity.content.parentId
          : enity.content.drivewsid,
      ),
      TE.chainFirstW(this.cachePutDetails),
    )
  }

  public createFolder = (path: string): TE.TaskEither<Error, DriveDetails> => {
    return pipe(
      splitParent(path),
      TE.fromOption(() => error(`invalid path ${path}`)),
      TE.chain(([parentPath, dirName]) =>
        pipe(
          TE.Do,
          TE.bind('parentPath', () => TE.of(parentPath)),
          TE.bind('dirName', () => TE.of(dirName)),
          TE.bind('parent', () => this.getFolderByPath(parentPath)),
          TE.filterOrElse(
            ({ parent }) =>
              pipe(
                parent.items,
                A.findFirst((_) => _.name === dirName),
                O.isNone,
              ),
            ({ parent }) => error(`${parent.name} already contains ${dirName}`),
          ),
          TE.bind('result', ({ parent, dirName }) => pipe(this.api.createFolders(parent.drivewsid, [dirName]))),
          TE.chain(({ parent }) => pipe(this.updateCachedEntityById(parent.drivewsid))),
        )
      ),
    )
  }

  public removeItemByPath = (path: string): TE.TaskEither<Error, void> => {
    return pipe(
      TE.Do,
      TE.bind('item', () =>
        pipe(
          this.cache.getByPath(path),
          TE.fromOption(() => error(`missing path ${path} in cache`)),
        )),
      TE.chainFirst(({ item }) =>
        this.api.moveItemsToTrash([{ drivewsid: item.content.drivewsid, etag: item.content.etag }])
      ),
      // TE.chainFirstW(() => this.cacheSet(this.cache.removeByPath(path))),
      TE.chainW(({ item }) =>
        !isRootCacheEntity(item)
          ? pipe(
            this.updateCachedEntityById(item.content.parentId),
            TE.chain(() => TE.of(constVoid())),
          )
          : TE.of(constVoid())
      ),
    )
  }

  public upload = (sourceFilePath: string, targetPath: string): TE.TaskEither<Error, DriveDetails> => {
    return pipe(
      TE.Do,
      TE.bind('parent', () => this.getFolderByPath(targetPath)),
      TE.bind('result', ({ parent }) => this.api.upload(sourceFilePath, parent.docwsid)),
      TE.chain((_) => this.updateCachedEntityById(_.parent.drivewsid)),
    )
  }

  public getDownloadUrl = (path: string): TE.TaskEither<Error, string> => {
    return pipe(
      this.getItemByPath(path),
      TE.filterOrElse(
        (item): item is DriveChildrenItemFile => item.type === 'FILE',
        () => error(`item is not file`),
      ),
      TE.chain((item) => this.api.download(item.docwsid, item.zone)),
    )
  }

  public getDownloadStream = (path: string): TE.TaskEither<Error, Readable> => {
    return pipe(
      this.getDownloadUrl(path),
      TE.chainW((url) => getUrlStream({ client: this.api.client, url })),
    )
  }

  private cachePutDetailsM = (
    detailss: DriveDetails[],
  ): TE.TaskEither<Error, void> => {
    return pipe(
      detailss,
      A.reduce(E.of<Error, Cache>(this.cache), (cache, d) =>
        pipe(
          cache,
          E.chain((_) => _.putDetails(d)),
        )),
      TE.fromEither,
      TE.chainW(this.cacheSet),
    )
  }

  private cachePutItems = (
    items: DriveChildrenItemFolder[],
  ): TE.TaskEither<Error, void> => {
    return pipe(
      items,
      A.reduce(E.of<Error, Cache>(this.cache), (cache, d) =>
        pipe(
          cache,
          E.chain((_) => _.putItem(d)),
        )),
      TE.fromEither,
      TE.chainW(this.cacheSet),
    )
  }

  private cachePutDetails = (
    details: DriveDetails,
  ): TE.TaskEither<Error, void> => {
    return pipe(
      this.cache.putDetails(details),
      TE.fromEither,
      TE.chainW(this.cacheSet),
    )
  }

  private cacheSet = (cache: Cache): TE.TaskEither<never, void> => {
    return TE.fromTask(async () => {
      this.cache = cache
    })
  }

  public cacheGet = (): Cache => {
    return this.cache
  }
}
