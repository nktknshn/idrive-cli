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
import {
  CacheEntity,
  CacheEntityAppLibraryDetails,
  CacheEntityAppLibraryItem,
  CacheEntityFile,
  CacheEntityFolderDetails,
  CacheEntityFolderItem,
  CacheEntityFolderRootDetails,
  CacheEntityFolderTrashDetails,
  CacheEntityWithParentId,
  CacheF,
  hasParentId,
  isDetailsCacheEntity,
  isFolderLikeCacheEntity,
  isRootCacheEntity,
  isTrashCacheEntity,
} from './types'

class lens {
  public static byDrivewsid = m.Lens.fromProp<CacheF>()('byDrivewsid')
}

export const cachef = (): CacheF => ({
  byDrivewsid: {},
})

export const getHierarchyById = (drivewsid: string) =>
  (cache: CacheF): E.Either<Error, Hierarchy> => {
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
      else if (isTrashCacheEntity(item.value)) {
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
  (cache: CacheF): E.Either<Error, string> => {
    return pipe(
      getHierarchyById(drivewsid)(cache),
      E.map(hierarchyToPath),
    )
  }

export const getRoot = () =>
  (cache: CacheF): E.Either<Error, CacheEntityFolderRootDetails> =>
    pipe(
      cache.byDrivewsid,
      R.lookup(rootDrivewsid),
      E.fromOption(() => MissinRootError.create(`getRoot(): missing root`)),
      E.filterOrElse(isRootCacheEntity, () => err('getRoot(): invalid root details')),
    )

export const getRootO = () =>
  (cache: CacheF): O.Option<CacheEntityFolderRootDetails> =>
    pipe(
      cache,
      getRoot(),
      O.fromEither,
    )

export const assertFolderWithDetailsEntity = (entity: CacheEntity): E.Either<Error, CacheEntityDetails> =>
  pipe(
    E.of(entity),
    E.filterOrElse(isFolderLikeCacheEntity, p =>
      ItemIsNotFolderError.create(`assertFolderWithDetails: ${p.content.drivewsid} is not a folder`)),
    E.filterOrElse(isDetailsCacheEntity, p =>
      FolderLikeMissingDetailsError.create(`${p.content.drivewsid} is missing details`)),
  )

export const getByPath = (path: string) =>
  (cache: CacheF): E.Either<Error, CacheEntity> => {
    const [, ...itemsNames] = parsePath(path)

    return pipe(
      itemsNames,
      A.reduceWithIndex(
        pipe(cache, getRoot(), E.map(cast<CacheEntity>())),
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
export type CacheEntityDetails = CacheEntityFolderRootDetails | CacheEntityFolderDetails | CacheEntityAppLibraryDetails

export const cacheEntityFromDetails = (
  details: Details,
): CacheEntity =>
  isCloudDocsRootDetails(details)
    ? new CacheEntityFolderRootDetails(details)
    : isTrashDetailsG(details)
    ? new CacheEntityFolderTrashDetails(details)
    : details.type === 'FOLDER'
    ? new CacheEntityFolderDetails(details)
    : new CacheEntityAppLibraryDetails(details)

const cacheEntityFromItem = (
  item: DriveChildrenItem,
): CacheEntity => {
  return item.type === 'FILE'
    ? new CacheEntityFile(item)
    : item.type === 'FOLDER'
    ? new CacheEntityFolderItem(item)
    : new CacheEntityAppLibraryItem(item)
}

export const getById = (drivewsid: string) =>
  (cache: CacheF): O.Option<CacheEntity> => {
    return pipe(cache.byDrivewsid, R.lookup(drivewsid))
  }

export const getItemById = (drivewsid: string) =>
  (cache: CacheF): E.Either<Error, O.Option<CacheEntityWithParentId>> => {
    return pipe(
      cache.byDrivewsid,
      R.lookup(drivewsid),
      O.fold(() => E.right(O.none), v => hasParentId(v) ? E.right(O.some(v)) : E.left(err(`item is not a`))),
    )
  }

export const getByIdE = (drivewsid: string) =>
  (cache: CacheF): E.Either<Error, CacheEntity> => {
    return pipe(
      cache,
      getById(drivewsid),
      E.fromOption(() => NotFoundError.create(`missing ${drivewsid}`)),
    )
  }

export const getFolderDetailsByIdE = (drivewsid: string) =>
  (cache: CacheF): E.Either<Error, CacheEntityDetails> => {
    return pipe(
      cache,
      getById(drivewsid),
      E.fromOption(() => NotFoundError.create(`missing ${drivewsid}`)),
      E.chain(assertFolderWithDetailsEntity),
    )
  }

export const addItems = (items: DriveChildrenItem[]) =>
  (cache: CacheF): E.Either<Error, CacheF> => {
    return pipe(
      items,
      A.reduce(E.of(cache), (acc, cur) => pipe(acc, E.chain(putItem(cur)))),
    )
  }

export const putRoot = (
  details: DetailsRoot,
): ((s: CacheF) => E.Either<Error, CacheF>) => {
  return flow(
    lens.byDrivewsid.modify(
      R.upsertAt(rootDrivewsid, cacheEntityFromDetails(details)),
    ),
    addItems(details.items),
  )
}

export const removeById = (drivewsid: string) =>
  (cache: CacheF) =>
    pipe(
      cache,
      lens.byDrivewsid.modify(R.deleteAt(drivewsid)),
    )

export const putDetailss = (
  detailss: Details[],
): ((cache: CacheF) => E.Either<Error, CacheF>) => {
  return cache =>
    pipe(
      detailss,
      A.reduce(E.of(cache), (c, d) => pipe(c, E.chain(putDetails(d)))),
    )
}

export const putEntities = (
  es: CacheEntity[],
): ((cache: CacheF) => E.Either<Error, CacheF>) => {
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
): ((cache: CacheF) => E.Either<Error, CacheF>) => {
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
): ((cache: CacheF) => E.Either<Error, CacheF>) => {
  const shouldBeUpdated = (cached: O.Option<CacheEntityWithParentId>, actual: DriveChildrenItem) => {
    return O.isNone(cached)
      || cached.value.content.etag !== item.etag
      || !cached.value.hasDetails
  }

  const res = (cache: CacheF) =>
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

export const validateCacheJson = (json: unknown): json is CacheF => {
  return isObjectWithOwnProperty(json, 'byDrivewsid')
}
