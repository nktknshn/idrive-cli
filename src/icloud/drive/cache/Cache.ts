// import * as A from 'fp-ts/lib/Array'
// import * as E from 'fp-ts/lib/Either'
// import { flow, pipe } from 'fp-ts/lib/function'
// import * as O from 'fp-ts/lib/Option'
// import * as RA from 'fp-ts/lib/ReadonlyArray'
// import * as R from 'fp-ts/lib/Record'
// import * as TE from 'fp-ts/lib/TaskEither'
// import { NormalizedPath } from '../../../cli/cli-drive/cli-drive-actions/helpers'
// import { err, TypeDecodingError } from '../../../lib/errors'
// import { tryReadJsonFile } from '../../../lib/files'
// import { saveJson } from '../../../lib/json'
// import { cacheLogger, logger, logReturn } from '../../../lib/logging'
// import { MissinRootError } from '../errors'
// import { parsePath } from '../helpers'
// import {
//   asOption,
//   Details,
//   DetailsRoot,
//   DriveChildrenItem,
//   fileName,
//   Hierarchy,
//   invalidId,
//   MaybeNotFound,
//   Root,
// } from '../requests/types/types'
// import { rootDrivewsid, trashDrivewsid } from '../requests/types/types-io'
// import * as C from './cachef'
// import { HierarchyResult } from './cachef/GetByPathResultValid'
// import { getFromCacheByPath } from './cachef/getPartialValidPath'
// import * as T from './types'

// export class Cache {
//   private readonly cache: T.CacheF

//   static tryReadFromFile = (
//     accountDataFilePath: string,
//   ): TE.TaskEither<Error, T.CacheF> => {
//     return pipe(
//       tryReadJsonFile(accountDataFilePath),
//       TE.filterOrElseW(
//         C.validateCacheJson,
//         () => TypeDecodingError.create([], 'wrong ICloudDriveCache json'),
//       ),
//     )
//   }

//   static trySaveFile = (
//     cache: Cache,
//     cacheFilePath: string,
//   ): TE.TaskEither<Error, void> => {
//     return pipe(cache.cache, saveJson(cacheFilePath))
//   }

//   static trySaveFileF = (
//     cacheFilePath: string,
//   ) => {
//     return (cache: Cache) => pipe(cache.cache, saveJson(cacheFilePath))
//   }

//   constructor(cache: T.CacheF = C.cachef()) {
//     this.cache = cache
//   }

//   public copy = (): Cache => Cache.create(this.cache)
//   public get = () => this.cache

//   putDetails = (details: Details): E.Either<Error, Cache> => {
//     return pipe(this.cache, C.putDetails(details), E.map(Cache.create))
//   }

//   putDetailss = <D extends Details>(detailss: D[]): E.Either<Error, Cache> => {
//     return pipe(
//       detailss,
//       A.reduce(
//         E.of<Error, Cache>(this),
//         (cache, detail) => pipe(cache, E.chain(cache => cache.putDetails(detail))),
//       ),
//     )
//   }

//   putItem = (item: DriveChildrenItem): E.Either<Error, Cache> => {
//     return pipe(this.cache, C.putItem(item), E.map(Cache.create))
//   }

//   putItems = (items: DriveChildrenItem[]): E.Either<Error, Cache> => {
//     return pipe(
//       items,
//       A.reduce(
//         E.of<Error, Cache>(this),
//         (cache, detail) => pipe(cache, E.chain(cache => cache.putItem(detail))),
//       ),
//     )
//   }

//   getRoot = (): O.Option<E.Either<Error, T.CacheEntityFolderRootDetails>> => {
//     return pipe(
//       this.cache.byDrivewsid,
//       R.lookup(rootDrivewsid),
//       O.map(
//         flow(E.fromPredicate(T.isRootCacheEntity, () => err('invalid root cache entity'))),
//       ),
//     )
//   }

//   getRootE = (): E.Either<Error, T.CacheEntityFolderRootDetails> => {
//     return pipe(
//       this.getRoot(),
//       E.fromOption(() => MissinRootError.create(`missing root entity in cache`)),
//       E.flatten,
//     )
//   }

//   getTrashE = (): E.Either<Error, T.CacheEntityFolderTrashDetails> => {
//     return pipe(
//       this.getByIdE(trashDrivewsid),
//       E.filterOrElse(T.isTrashCacheEntity, () => err(`invalid trash details`)),
//     )
//   }

//   getById = (drivewsid: string): O.Option<T.CacheEntity> => {
//     return pipe(
//       pipe(this.cache.byDrivewsid, R.lookup(drivewsid)),
//       logReturn(
//         O.fold(
//           () => cacheLogger.debug(`cache miss for ${drivewsid}`),
//           _ => cacheLogger.debug(`cache hit for ${drivewsid} (${fileName(_.content)}) hasDetails: ${_.hasDetails}`),
//         ),
//       ),
//     )
//   }

//   getByIds = (drivewsids: string[]): O.Option<T.CacheEntity>[] => {
//     return pipe(drivewsids, A.map(this.getById))
//   }

//   getByIdE = (drivewsid: string): E.Either<Error, T.CacheEntity> => {
//     return pipe(
//       this.getById(drivewsid),
//       E.fromOption(() => err(`missing ${drivewsid} in cache`)),
//     )
//   }

//   getByIdWithPath = (drivewsid: string): O.Option<{ entity: T.CacheEntity; path: string }> => {
//     return pipe(
//       O.Do,
//       O.bind('entity', () => this.getById(drivewsid)),
//       O.bind('path', () => this.getCachedPathForId(drivewsid)),
//     )
//   }

//   getFolderById = (drivewsid: string) => {
//     return pipe(
//       this.getById(drivewsid),
//       O.map(
//         flow(
//           E.fromPredicate(T.isFolderLikeCacheEntity, () => err(`getFolderById: ${drivewsid} is not a folder`)),
//         ),
//       ),
//     )
//   }

//   getFolderByIdE = (drivewsid: string) => {
//     return pipe(
//       this.getByIdE(drivewsid),
//       E.chain(flow(
//         E.fromPredicate(T.isFolderLikeCacheEntity, () => err(`getFolderByIdE: ${drivewsid} is not a folder`)),
//       )),
//     )
//   }

//   getFolderDetailsById = (
//     drivewsid: string,
//   ): O.Option<
//     E.Either<Error, T.CacheEntityFolderRootDetails | T.CacheEntityFolderDetails | T.CacheEntityAppLibraryDetails>
//   > =>
//     pipe(
//       this.getFolderById(drivewsid),
//       O.chain(
//         flow(E.fold(
//           err => O.some(E.left(err)),
//           flow(O.fromPredicate(T.isDetailsCacheEntity), O.map(E.of)),
//         )),
//       ),
//     )

//   getFolderDetailsByIds = (
//     drivewsids: string[],
//   ): E.Either<Error, MaybeNotFound<Details>[]> => {
//     return pipe(
//       drivewsids,
//       A.map(id => this.getFolderDetailsById(id)),
//       A.map(O.fold(() => E.right<Error, MaybeNotFound<Details>>(invalidId), E.map(v => v.content))),
//       E.sequenceArray,
//       E.map(RA.toArray),
//     )
//   }

//   getFolderDetailsByIdsO = (
//     drivewsids: string[],
//   ): E.Either<Error, O.Option<Details>[]> =>
//     pipe(
//       this.getFolderDetailsByIds(drivewsids),
//       E.map(A.map(asOption)),
//     )

//   getFolderDetailsByIdsSeparated = (
//     drivewsids: string[],
//   ): E.Either<
//     Error,
//     {
//       missed: string[]
//       cached: readonly (T.CacheEntityFolderRootDetails | T.CacheEntityFolderDetails | T.CacheEntityAppLibraryDetails)[]
//     }
//   > =>
//     pipe(
//       drivewsids,
//       A.map(id => pipe(this.getFolderDetailsById(id), E.fromOption(() => id))),
//       A.separate,
//       ({ left: missed, right: cached }) =>
//         pipe(
//           E.sequenceArray(cached),
//           E.map((cached) => ({ missed, cached })),
//         ),
//     )

//   getCachedHierarchyById = (
//     drivewsid: string,
//   ): E.Either<Error, Hierarchy> => {
//     const go = (drivewsid: string): E.Either<Error, Hierarchy> =>
//       pipe(
//         E.Do,
//         E.bind('item', () => this.getByIdE(drivewsid)),
//         E.bind('result', ({ item }) =>
//           T.isRootCacheEntity(item)
//             ? E.of<Error, Hierarchy>([{ drivewsid: rootDrivewsid }])
//             : T.isTrashCacheEntity(item)
//             ? E.of<Error, Hierarchy>([{ drivewsid: trashDrivewsid }])
//             : pipe(
//               go(item.content.parentId),
//               E.map((
//                 h,
//               ): Hierarchy => [...h, {
//                 drivewsid: item.content.drivewsid,
//                 name: item.content.name,
//                 etag: item.content.etag,
//               }]),
//             )),
//         E.map(_ => _.result),
//       )

//     return pipe(
//       go(drivewsid),
//       E.map(flow(A.dropRight(1))),
//     )
//   }

//   getByPath = <R extends Root>(
//     root: Root,
//     path: NormalizedPath,
//   ): E.Either<Error, HierarchyResult<R>> => {
//     const parts = parsePath(path)
//     const rest = pipe(parts, A.dropLeft(1))

//     return pipe(
//       E.Do,
//       E.bind('root', () => E.of(root)),
//       E.map(({ root }) =>
//         pipe(
//           this.cache,
//           getFromCacheByPath(rest, root),
//           v => v as HierarchyResult<R>,
//         )
//       ),
//     )
//   }

//   getByIdU = (drivewsid: string): T.CacheEntity | undefined => {
//     return pipe(this.getById(drivewsid), O.toUndefined)
//   }

//   getCachedPathForId = (drivewsid: string): O.Option<string> => {
//     return pipe(C.getCachedPathForId(drivewsid)(this.cache), O.fromEither)
//   }

//   getCachedPathForIdE = (drivewsid: string): E.Either<Error, string> => {
//     return pipe(
//       C.getCachedPathForId(drivewsid)(this.cache),
//     )
//   }

//   removeById = (drivewsid: string): Cache => pipe(this.cache, C.removeById(drivewsid), Cache.create)

//   removeByIds = (drivewsids: string[]): Cache =>
//     pipe(
//       drivewsids,
//       A.reduce(this.cache, (cache, cur) => C.removeById(cur)(cache)),
//       Cache.create,
//     )

//   // findByPathGlob = (path: string): [string, ICloudDriveCacheEntity][] => {
//   //   const npath = normalizePath(path)
//   //   return pipe(
//   //     this.cache.byPath,
//   //     R.filterWithIndex(
//   //       (path) => path == npath || path.startsWith(npath + '/'),
//   //     ),
//   //     R.toArray,
//   //   )
//   // }
//   // , includeDescendors = true
//   // removeByPath = (path: string): Cache => {
//   //   return pipe(
//   //     this.findByPathGlob(path),
//   //     A.reduce(this.cache, (cache, [path, entity]) =>
//   //       pipe(
//   //         cache,
//   //         // lens.byPath.modify(R.deleteAt(path)),
//   //         lens.byDrivewsid.modify(R.deleteAt(entity.content.drivewsid)),
//   //       )),
//   //     Cache.create,
//   //   )
//   // }
//   static create(cache: T.CacheF = C.cachef()): Cache {
//     return new Cache(cache)
//   }

//   static fromRootDetails(rootDetails: DetailsRoot): Cache {
//     return new Cache({
//       // root: O.some(rootDetails),
//       byDrivewsid: {
//         [rootDetails.drivewsid as string]: C.cacheEntityFromDetails(rootDetails),
//       },
//       // byPath: {
//       //   '/': cacheEntityFromDetails(rootDetails),
//       // },
//     })
//   }

//   static concat(a: Cache, b: Cache): Cache {
//     const M = R.getMonoid({ concat: (a: T.CacheEntity, b: T.CacheEntity) => b })

//     // cacheLogger.debug(`concat ${JSON.stringify(a.get())}`)
//     // cacheLogger.debug(`concat ${JSON.stringify(b.get())}`)
//     return Cache.create(
//       { byDrivewsid: M.concat(a.get().byDrivewsid, b.get().byDrivewsid) },
//     )
//   }

//   static semigroup = Cache
// }
