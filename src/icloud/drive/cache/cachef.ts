import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as R from 'fp-ts/lib/Record'
import * as m from 'monocle-ts'
import { hierarchyToPath } from '../../../cli/cli-drive/cli-drive-actions/helpers'
import { err } from '../../../lib/errors'
import { cacheLogger } from '../../../lib/logging'
import { cast, isObjectWithOwnProperty } from '../../../lib/util'
import { FolderLikeMissingDetailsError, ItemIsNotFolderError, MissinRootError, NotFoundError } from '../errors'
import { parsePath } from '../helpers'
import {
  Details,
  DetailsRoot,
  DriveChildrenItem,
  fileName,
  Hierarchy,
  isCloudDocsRootDetails,
  isTrashDetailsG,
} from '../requests/types/types'
import { rootDrivewsid, trashDrivewsid } from '../requests/types/types-io'
import { MissingParentError } from './errors'
import * as T from './types'

class lens {
  public static byDrivewsid = m.Lens.fromProp<T.CacheF>()('byDrivewsid')
}

export const cachef = (): T.CacheF => ({
  byDrivewsid: {},
})

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

export const getByPath = (path: string) =>
  (cache: T.CacheF): E.Either<Error, T.CacheEntity> => {
    const [, ...itemsNames] = parsePath(path)

    return pipe(
      itemsNames,
      A.reduceWithIndex(
        pipe(cache, getRoot(), E.map(cast<T.CacheEntity>())),
        (index, parentFolder, itemName) =>
          pipe(
            E.Do,
            E.bind('folder', () => pipe(parentFolder, E.chain(assertFolderWithDetailsEntity))),
            E.bindW('item', ({ folder }) =>
              pipe(
                folder.content.items,
                A.findFirst(item => fileName(item) === itemName),
                E.fromOption(() =>
                  NotFoundError.create(
                    `item "${itemName}" was not found in "${folder.content.name}" (${folder.content.drivewsid})`,
                  )
                ),
              )),
            E.chain(({ item }) =>
              pipe(
                cache,
                getById(item.drivewsid),
                E.fromOption(() => err(`missing ${item.drivewsid} in cache`)),
              )
            ),
          ),
      ),
    )
  }
export type CacheEntityDetails =
  | T.CacheEntityFolderRootDetails
  | T.CacheEntityFolderDetails
  | T.CacheEntityAppLibraryDetails

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

export const validateCacheJson = (json: unknown): json is T.CacheF => {
  return isObjectWithOwnProperty(json, 'byDrivewsid')
}
