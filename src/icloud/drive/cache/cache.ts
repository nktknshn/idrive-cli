import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import * as R from 'fp-ts/lib/Record'
import * as TE from 'fp-ts/lib/TaskEither'
import * as m from 'monocle-ts'
import { hierarchyToPath, NormalizedPath } from '../../../cli/cli-drive/cli-drive-actions/helpers'
import { err, TypeDecodingError } from '../../../lib/errors'
import { tryReadJsonFile } from '../../../lib/files'
import { saveJson } from '../../../lib/json'
import { cacheLogger } from '../../../lib/logging'
import { isObjectWithOwnProperty } from '../../../lib/util'
import { FolderLikeMissingDetailsError, ItemIsNotFolderError, MissinRootError, NotFoundError } from '../errors'
import { parsePath } from '../helpers'
import {
  Details,
  DetailsRoot,
  DriveChildrenItem,
  fileName,
  Hierarchy,
  invalidId,
  isCloudDocsRootDetails,
  isTrashDetailsG,
  MaybeNotFound,
  Root,
} from '../requests/types/types'
import { rootDrivewsid, trashDrivewsid } from '../requests/types/types-io'
import { getFromCacheByPath } from './cache-get-by-path'
import { HierarchyResult } from './cache-get-by-path-types'
import { MissingParentError } from './errors'
import * as T from './types'

export type Cache = T.CacheF

class lens {
  public static byDrivewsid = m.Lens.fromProp<T.CacheF>()('byDrivewsid')
}

export const cachef = (): T.CacheF => ({
  byDrivewsid: {},
})

export type CacheEntityDetails =
  | T.CacheEntityFolderRootDetails
  | T.CacheEntityFolderDetails
  | T.CacheEntityAppLibraryDetails

export const getHierarchyById = (drivewsid: string) =>
  (cache: T.CacheF): E.Either<Error, Hierarchy> => {
    const h: Hierarchy = []

    let item = pipe(
      cache.byDrivewsid,
      R.lookup(drivewsid),
    )

    while (O.isSome(item)) {
      if (T.isRootCacheEntity(item.value)) {
        h.push({ drivewsid: rootDrivewsid })
        return E.right(A.reverse(h))
      }
      else if (T.isTrashCacheEntity(item.value)) {
        h.push({ drivewsid: trashDrivewsid })
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

    return E.left(err(`missing ${drivewsid} in cache`))
  }

export const getCachedPathForId = (drivewsid: string) =>
  (cache: T.CacheF): E.Either<Error, string> => {
    return pipe(
      getHierarchyById(drivewsid)(cache),
      E.map(hierarchyToPath),
    )
  }

export const getRoot = () =>
  (cache: T.CacheF): E.Either<Error, T.CacheEntityFolderRootDetails> =>
    pipe(
      cache.byDrivewsid,
      R.lookup(rootDrivewsid),
      E.fromOption(() => MissinRootError.create(`getRoot(): missing root`)),
      E.filterOrElse(T.isRootCacheEntity, () => err('getRoot(): invalid root details')),
    )

export const getTrashE = () =>
  (cache: T.CacheF): E.Either<Error, T.CacheEntityFolderTrashDetails> =>
    pipe(
      cache.byDrivewsid,
      R.lookup(trashDrivewsid),
      E.fromOption(() => MissinRootError.create(`getTrashE(): missing trash`)),
      E.filterOrElse(T.isTrashCacheEntity, () => err('getRoot(): invalid root details')),
    )

export const getRootO = () =>
  (cache: T.CacheF): O.Option<T.CacheEntityFolderRootDetails> =>
    pipe(
      cache,
      getRoot(),
      O.fromEither,
    )

export const assertFolderWithDetailsEntity = (entity: T.CacheEntity): E.Either<Error, CacheEntityDetails> =>
  pipe(
    E.of(entity),
    E.filterOrElse(T.isFolderLikeCacheEntity, p =>
      ItemIsNotFolderError.create(`assertFolderWithDetails: ${p.content.drivewsid} is not a folder`)),
    E.filterOrElse(T.isDetailsCacheEntity, p =>
      FolderLikeMissingDetailsError.create(`${p.content.drivewsid} is missing details`)),
  )

export const cacheEntityFromDetails = (
  details: Details,
): T.CacheEntity =>
  isCloudDocsRootDetails(details)
    ? new T.CacheEntityFolderRootDetails(details)
    : isTrashDetailsG(details)
    ? new T.CacheEntityFolderTrashDetails(details)
    : details.type === 'FOLDER'
    ? new T.CacheEntityFolderDetails(details)
    : new T.CacheEntityAppLibraryDetails(details)

const cacheEntityFromItem = (
  item: DriveChildrenItem,
): T.CacheEntity => {
  return item.type === 'FILE'
    ? new T.CacheEntityFile(item)
    : item.type === 'FOLDER'
    ? new T.CacheEntityFolderItem(item)
    : new T.CacheEntityAppLibraryItem(item)
}

export const getById = (drivewsid: string) =>
  (cache: T.CacheF): O.Option<T.CacheEntity> => {
    return pipe(cache.byDrivewsid, R.lookup(drivewsid))
  }

export const getItemById = (drivewsid: string) =>
  (cache: T.CacheF): E.Either<Error, O.Option<T.CacheEntityWithParentId>> => {
    return pipe(
      cache.byDrivewsid,
      R.lookup(drivewsid),
      O.fold(() => E.right(O.none), v => T.hasParentId(v) ? E.right(O.some(v)) : E.left(err(`item is not a`))),
    )
  }

export const getByIdE = (drivewsid: string) =>
  (cache: T.CacheF): E.Either<Error, T.CacheEntity> => {
    return pipe(
      cache,
      getById(drivewsid),
      E.fromOption(() => NotFoundError.create(`missing ${drivewsid}`)),
    )
  }

export const getFolderDetailsByIdE = (drivewsid: string) =>
  (cache: T.CacheF): E.Either<Error, CacheEntityDetails> => {
    return pipe(
      cache,
      getById(drivewsid),
      E.fromOption(() => NotFoundError.create(`missing ${drivewsid}`)),
      E.chain(assertFolderWithDetailsEntity),
    )
  }

export const addItems = (items: DriveChildrenItem[]) =>
  (cache: T.CacheF): E.Either<Error, T.CacheF> => {
    return pipe(
      items,
      A.reduce(E.of(cache), (acc, cur) => pipe(acc, E.chain(putItem(cur)))),
    )
  }

export const putRoot = (
  details: DetailsRoot,
): ((s: T.CacheF) => E.Either<Error, T.CacheF>) => {
  return flow(
    lens.byDrivewsid.modify(
      R.upsertAt(rootDrivewsid, cacheEntityFromDetails(details)),
    ),
    addItems(details.items),
  )
}

export const removeById = (drivewsid: string) =>
  (cache: T.CacheF) =>
    pipe(
      cache,
      lens.byDrivewsid.modify(R.deleteAt(drivewsid)),
    )

export const putDetailss = (
  detailss: Details[],
): ((cache: T.CacheF) => E.Either<Error, T.CacheF>) => {
  return cache =>
    pipe(
      detailss,
      A.reduce(E.of(cache), (c, d) => pipe(c, E.chain(putDetails(d)))),
    )
}

export const putItems = (items: DriveChildrenItem[]) =>
  (cache: T.CacheF): E.Either<Error, T.CacheF> => {
    return pipe(
      items,
      A.reduce(
        E.of<Error, T.CacheF>(cache),
        (cache, detail) => pipe(cache, E.chain(putItem(detail))),
      ),
    )
  }

export const putEntities = (
  es: T.CacheEntity[],
): ((cache: T.CacheF) => E.Either<Error, T.CacheF>) => {
  return cache =>
    pipe(
      es,
      A.reduce(E.of(cache), (c, ent) =>
        pipe(
          c,
          E.chain(
            ent.hasDetails
              ? putDetails(ent.content)
              : putItem(ent.content),
          ),
        )),
    )
}

export const putDetails = (
  details: Details,
): ((cache: T.CacheF) => E.Either<Error, T.CacheF>) => {
  cacheLogger.debug(
    `putting ${details.drivewsid} ${fileName(details)} etag: ${isTrashDetailsG(details) ? 'trash' : details.etag} (${
      details.items.map(fileName)
    })`,
  )

  return (cache) =>
    pipe(
      E.Do,
      E.bind('entity', () => E.of(cacheEntityFromDetails(details))),
      E.chain(({ entity }) =>
        pipe(
          cache,
          lens.byDrivewsid.modify(R.upsertAt(details.drivewsid, entity)),
          // E.of,
          addItems(details.items),
        )
      ),
    )
}

export const putItem = (
  item: DriveChildrenItem,
): ((cache: T.CacheF) => E.Either<Error, T.CacheF>) => {
  const shouldBeUpdated = (cached: O.Option<T.CacheEntityWithParentId>, actual: DriveChildrenItem) => {
    return O.isNone(cached)
      || cached.value.content.etag !== item.etag
      || !cached.value.hasDetails
  }

  const res = (cache: T.CacheF) =>
    pipe(
      E.Do,
      E.bind('parentPath', () =>
        pipe(
          cache,
          getByIdE(item.parentId),
          E.mapLeft(() =>
            MissingParentError.create(
              `putItem: missing parent ${item.parentId} in cache while putting ${fileName(item)}`,
            )
          ),
        )),
      E.bind('cachedEntity', () => pipe(cache, getItemById(item.drivewsid))),
      E.bind(
        'needsUpdate',
        ({ cachedEntity }) => E.of(shouldBeUpdated(cachedEntity, item)),
      ),
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

  return res
}

export const getByPath = <R extends Root>(
  root: Root,
  path: NormalizedPath,
) =>
  (cache: T.CacheF): E.Either<Error, HierarchyResult<R>> => {
    const parts = parsePath(path)
    const rest = pipe(parts, A.dropLeft(1))

    return pipe(
      E.Do,
      E.bind('root', () => E.of(root)),
      E.map(({ root }) =>
        pipe(
          cache,
          getFromCacheByPath(rest, root),
          v => v as HierarchyResult<R>,
        )
      ),
    )
  }

export const validateCacheJson = (json: unknown): json is T.CacheF => {
  return isObjectWithOwnProperty(json, 'byDrivewsid')
}

export const getFolderById = (drivewsid: string) =>
  (cache: T.CacheF) => {
    return pipe(
      cache,
      getById(drivewsid),
      O.map(
        flow(
          E.fromPredicate(T.isFolderLikeCacheEntity, () => err(`getFolderById: ${drivewsid} is not a folder`)),
        ),
      ),
    )
  }

export const getFolderDetailsById = (
  drivewsid: string,
) =>
  (cache: T.CacheF): O.Option<
    E.Either<Error, T.CacheEntityFolderRootDetails | T.CacheEntityFolderDetails | T.CacheEntityAppLibraryDetails>
  > =>
    pipe(
      cache,
      getFolderById(drivewsid),
      O.chain(
        flow(E.fold(
          err => O.some(E.left(err)),
          flow(O.fromPredicate(T.isDetailsCacheEntity), O.map(E.of)),
        )),
      ),
    )

export const getFolderDetailsByIdsSeparated = (
  drivewsids: string[],
) =>
  (cache: T.CacheF): E.Either<
    Error,
    {
      missed: string[]
      cached: readonly (T.CacheEntityFolderRootDetails | T.CacheEntityFolderDetails | T.CacheEntityAppLibraryDetails)[]
    }
  > =>
    pipe(
      drivewsids,
      A.map(id => pipe(cache, getFolderDetailsById(id), E.fromOption(() => id))),
      A.separate,
      ({ left: missed, right: cached }) =>
        pipe(
          E.sequenceArray(cached),
          E.map((cached) => ({ missed, cached })),
        ),
    )

export const getFolderDetailsByIds = (
  drivewsids: string[],
) =>
  (cache: T.CacheF): E.Either<Error, MaybeNotFound<Details>[]> => {
    return pipe(
      drivewsids,
      A.map(id => getFolderDetailsById(id)(cache)),
      A.map(O.fold(() => E.right<Error, MaybeNotFound<Details>>(invalidId), E.map(v => v.content))),
      E.sequenceArray,
      E.map(RA.toArray),
    )
  }

export const getFolderByIdE = (drivewsid: string) =>
  (cache: T.CacheF) => {
    return pipe(
      getByIdE(drivewsid)(cache),
      E.chain(flow(
        E.fromPredicate(T.isFolderLikeCacheEntity, () => err(`getFolderByIdE: ${drivewsid} is not a folder`)),
      )),
    )
  }

export const getByIdWithPath = (drivewsid: string) =>
  (cache: Cache) =>
    pipe(
      E.Do,
      E.bind('entity', () => getByIdE(drivewsid)(cache)),
      E.bind('path', () => getCachedPathForId(drivewsid)(cache)),
    )

export const removeByIds = (drivewsids: string[]) =>
  (cache: T.CacheF): Cache =>
    pipe(
      drivewsids,
      A.reduce(cache, (cache, cur) => removeById(cur)(cache)),
    )

export const trySaveFile = (
  cache: Cache,
  cacheFilePath: string,
): TE.TaskEither<Error, void> => {
  return pipe(cache, saveJson(cacheFilePath))
}

export const trySaveFileF = (
  cacheFilePath: string,
) => {
  return (cache: Cache) => pipe(cache, saveJson(cacheFilePath))
}

export const tryReadFromFile = (
  accountDataFilePath: string,
): TE.TaskEither<Error, T.CacheF> => {
  return pipe(
    tryReadJsonFile(accountDataFilePath),
    TE.filterOrElseW(
      validateCacheJson,
      () => TypeDecodingError.create([], 'wrong ICloudDriveCache json'),
    ),
  )
}
