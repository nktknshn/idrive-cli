import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { constVoid, flow, hole, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import { snd } from 'fp-ts/lib/ReadonlyTuple'
import * as TE from 'fp-ts/lib/TaskEither'
import { get } from 'spectacles-ts'
import { Readable } from 'stream'
import { error } from '../../lib/errors'
import { cacheLogger, logReturn } from '../../lib/logging'
import { Cache, isFolderLikeCacheEntity, isFolderLikeType } from './cache/cachef'
import { ICloudDriveCacheEntity } from './cache/types'
import { DriveApi } from './drive-api'
import { fileName, parsePath, splitParent } from './helpers'
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
  isRootDetails,
  rootDrivewsid,
} from './types'

export class Drive {
  private cache: Cache
  private api: DriveApi

  constructor(api: DriveApi, cache: Cache = Cache.create()) {
    this.cache = cache
    this.api = api
  }

  public getRoot = (): TE.TaskEither<Error, DriveDetails | DriveChildrenItem> => {
    return pipe(
      this.cachingRetrieveItemDetailsInFolder(rootDrivewsid),
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
          TE.bind('details', () => this.api.retrieveItemDetailsInFolders(left)),
          TE.bind('cache', ({ details }) => pipe(this.cache.putDetailss(details), TE.fromEither)),
          TE.chainFirstW(({ cache }) => this.cacheSet(cache)),
          TE.map(
            ({ cached, details }) => pipe([...cached.map(_ => _.content)], A.concat(details)),
          ),
        ),
    )
  }

  private cachingRetrieveItemDetailsInFolder = (drivewsid: string) => {
    return pipe(
      this.cache.getById(drivewsid),
      O.fold(
        () => this.api.retrieveItemDetailsInFolder(drivewsid),
        flow(
          TE.of,
          TE.filterOrElse(isFolderLikeCacheEntity, () => error(`${drivewsid} is not a folder`)),
          TE.chain((_) =>
            _.hasDetails
              ? TE.of(_.content)
              : this.api.retrieveItemDetailsInFolder(drivewsid)
          ),
        ),
      ),
      TE.chainFirst(this.cachePutDetails),
    )
  }

  private fetchItemByFunc = <T>(f: (v: T) => (item: DriveChildrenItem) => boolean) =>
    (
      parentId: TE.TaskEither<Error, string>,
      value: T,
    ): TE.TaskEither<Error, { item: DriveChildrenItem; parent: DriveDetails }> =>
      pipe(
        TE.Do,
        TE.bind('parentId', () => parentId),
        TE.bind('parent', ({ parentId }) => this.cachingRetrieveItemDetailsInFolder(parentId)),
        TE.bind('item', ({ parent, parentId }) =>
          pipe(
            parent.items,
            A.findFirst(f(value)),
            TE.fromOption(() =>
              error(
                `item "${value}" was not found in "${parent.name}" (${parentId})`,
              )
            ),
          )),
      )

  public getByPath = (
    path: string,
  ): TE.TaskEither<Error, DriveDetails | DriveChildrenItemFile> => {
    return pipe(
      this.getItemByPath(path),
      TE.chain(item =>
        isFolderLike(item)
          ? this.cachingRetrieveItemDetailsInFolder(item.drivewsid)
          : TE.of<Error, DriveDetails | DriveChildrenItemFile>(item)
      ),
    )
  }

  public getFolderRecursive = (
    path: string,
    opts: { depth: number },
  ): TE.TaskEither<Error, { readonly parent: DriveDetails; readonly children: (DriveDetails | DriveChildrenItem)[] }> =>
    pipe(
      TE.Do,
      TE.bind('parent', () => this.getFolderByPath(path)),
      TE.bind('children', ({ parent }) => {
        const { right: subFolders, left: files } = pipe(
          parent.items,
          A.partition(isFolderLike),
        )
        return pipe(
          this.cachingRetrieveItemDetailsInFolders(
            pipe(subFolders, A.map(_ => _.drivewsid)),
          ),
          TE.map(details => pipe(details, A.concat(files))),
        )
      }),
    )

  public getItemByPath = (
    path: string,
  ): TE.TaskEither<Error, DriveDetails | DriveChildrenItem> => {
    const [, ...parsedPath] = parsePath(path)

    return pipe(
      parsedPath,
      A.reduce(
        this.getRoot(),
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
                : this.cachingRetrieveItemDetailsInFolder(item.drivewsid),
            ),
            // TE.map(_ => _.result),
          ),
      ),
    )
  }

  public getFolderByPath = (path: string): TE.TaskEither<Error, DriveDetails> => {
    return pipe(
      this.getByPath(path),
      TE.filterOrElse(isFolderLike, () => error(`is not folder`)),
      TE.chain(_ => this.cachingRetrieveItemDetailsInFolder(_.drivewsid)),
      TE.chainFirstW(this.cachePutDetails),
    )
  }

  // public getFolderByPath = (path: string): TE.TaskEither<Error, DriveDetails> => {
  //   const [, ...parsedPath] = parsePath(path)
  //   // logger.info(parsedPath)

  //   return pipe(
  //     parsedPath,
  //     A.reduce(
  //       TE.of(rootDrivewsid),
  //       flow(
  //         this.fetchItemByFunc(
  //           (itemName) => (item) => fileName(item) === itemName,
  //         ),
  //         TE.filterOrElse(
  //           ({ item }) => isFolderLikeType(item.type),
  //           ({ item }) => error(`${item.name} (${item.drivewsid}) is not a folder`),
  //         ),
  //         TE.map(({ item }) => item.drivewsid),
  //       ),
  //     ),
  //     TE.chain(this.cachedRetrieveItemDetailsInFolder),
  //     TE.chainFirstW(this.cachePutDetails),
  //   )
  // }

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
        this.api.moveItemsToTrash([
          {
            drivewsid: item.content.drivewsid,
            etag: item.content.etag,
          },
        ])
      ),
      TE.chainFirstW(() => this.cacheSet(this.cache.removeByPath(path))),
      TE.chainW(({ item }) =>
        item.type !== 'ROOT'
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
