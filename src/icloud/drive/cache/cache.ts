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
import * as T from '../requests/types/types'
import { rootDrivewsid, trashDrivewsid } from '../requests/types/types-io'
import { getFromCacheByPath } from './cache-get-by-path'
import { HierarchyResult } from './cache-get-by-path-types'
import * as CT from './cache-types'
import { MissingParentError } from './errors'

export type Cache = CT.CacheF

class lens {
  public static byDrivewsid = m.Lens.fromProp<CT.CacheF>()('byDrivewsid')
}

export const cachef = (): CT.CacheF => ({
  byDrivewsid: {},
})

export type CacheEntityDetails =
  | CT.CacheEntityFolderRootDetails
  | CT.CacheEntityFolderDetails
  | CT.CacheEntityAppLibraryDetails

export const getHierarchyById = (drivewsid: string) =>
  (cache: CT.CacheF): E.Either<Error, T.Hierarchy> => {
    const h: T.Hierarchy = []

    let item = pipe(
      cache.byDrivewsid,
      R.lookup(drivewsid),
    )

    while (O.isSome(item)) {
      if (CT.isRootCacheEntity(item.value)) {
        h.push({ drivewsid: rootDrivewsid })
        return E.right(A.reverse(h))
      }
      else if (CT.isTrashCacheEntity(item.value)) {
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
  (cache: CT.CacheF): E.Either<Error, string> => {
    return pipe(
      getHierarchyById(drivewsid)(cache),
      E.map(hierarchyToPath),
    )
  }

export const getRoot = () =>
  (cache: CT.CacheF): E.Either<Error, CT.CacheEntityFolderRootDetails> =>
    pipe(
      cache.byDrivewsid,
      R.lookup(rootDrivewsid),
      E.fromOption(() => MissinRootError.create(`getRoot(): missing root`)),
      E.filterOrElse(CT.isRootCacheEntity, () => err('getRoot(): invalid root details')),
    )

export const getTrashE = () =>
  (cache: CT.CacheF): E.Either<Error, CT.CacheEntityFolderTrashDetails> =>
    pipe(
      cache.byDrivewsid,
      R.lookup(trashDrivewsid),
      E.fromOption(() => MissinRootError.create(`getTrashE(): missing trash`)),
      E.filterOrElse(CT.isTrashCacheEntity, () => err('getRoot(): invalid root details')),
    )

export const getRootO = () =>
  (cache: CT.CacheF): O.Option<CT.CacheEntityFolderRootDetails> =>
    pipe(
      cache,
      getRoot(),
      O.fromEither,
    )

export const assertFolderWithDetailsEntity = (entity: CT.CacheEntity): E.Either<Error, CacheEntityDetails> =>
  pipe(
    E.of(entity),
    E.filterOrElse(CT.isFolderLikeCacheEntity, p =>
      ItemIsNotFolderError.create(`assertFolderWithDetails: ${p.content.drivewsid} is not a folder`)),
    E.filterOrElse(CT.isDetailsCacheEntity, p =>
      FolderLikeMissingDetailsError.create(`${p.content.drivewsid} is missing details`)),
  )

export const cacheEntityFromDetails = (
  details: T.Details,
): CT.CacheEntity =>
  T.isCloudDocsRootDetails(details)
    ? new CT.CacheEntityFolderRootDetails(details)
    : T.isTrashDetailsG(details)
    ? new CT.CacheEntityFolderTrashDetails(details)
    : details.type === 'FOLDER'
    ? new CT.CacheEntityFolderDetails(details)
    : new CT.CacheEntityAppLibraryDetails(details)

const cacheEntityFromItem = (
  item: T.DriveChildrenItem,
): CT.CacheEntity => {
  return item.type === 'FILE'
    ? new CT.CacheEntityFile(item)
    : item.type === 'FOLDER'
    ? new CT.CacheEntityFolderItem(item)
    : new CT.CacheEntityAppLibraryItem(item)
}

export const getById = (drivewsid: string) =>
  (cache: CT.CacheF): O.Option<CT.CacheEntity> => {
    return pipe(cache.byDrivewsid, R.lookup(drivewsid))
  }

export const getItemById = (drivewsid: string) =>
  (cache: CT.CacheF): E.Either<Error, O.Option<CT.CacheEntityWithParentId>> => {
    return pipe(
      cache.byDrivewsid,
      R.lookup(drivewsid),
      O.fold(() => E.right(O.none), v => CT.hasParentId(v) ? E.right(O.some(v)) : E.left(err(`item is not a`))),
    )
  }

export const getByIdE = (drivewsid: string) =>
  (cache: CT.CacheF): E.Either<Error, CT.CacheEntity> => {
    return pipe(
      cache,
      getById(drivewsid),
      E.fromOption(() => NotFoundError.create(`missing ${drivewsid}`)),
    )
  }

export const getFolderDetailsByIdE = (drivewsid: string) =>
  (cache: CT.CacheF): E.Either<Error, CacheEntityDetails> => {
    return pipe(
      cache,
      getById(drivewsid),
      E.fromOption(() => NotFoundError.create(`missing ${drivewsid}`)),
      E.chain(assertFolderWithDetailsEntity),
    )
  }

export const addItems = (items: T.DriveChildrenItem[]) =>
  (cache: CT.CacheF): E.Either<Error, CT.CacheF> => {
    return pipe(
      items,
      A.reduce(E.of(cache), (acc, cur) => pipe(acc, E.chain(putItem(cur)))),
    )
  }

export const putRoot = (
  details: T.DetailsRoot,
): ((s: CT.CacheF) => E.Either<Error, CT.CacheF>) => {
  return flow(
    lens.byDrivewsid.modify(
      R.upsertAt(rootDrivewsid, cacheEntityFromDetails(details)),
    ),
    addItems(details.items),
  )
}

export const removeById = (drivewsid: string) =>
  (cache: CT.CacheF) =>
    pipe(
      cache,
      lens.byDrivewsid.modify(R.deleteAt(drivewsid)),
    )

export const putDetailss = (
  detailss: T.Details[],
): ((cache: CT.CacheF) => E.Either<Error, CT.CacheF>) => {
  return cache =>
    pipe(
      detailss,
      A.reduce(E.of(cache), (c, d) => pipe(c, E.chain(putDetails(d)))),
    )
}

export const putItems = (items: T.DriveChildrenItem[]) =>
  (cache: CT.CacheF): E.Either<Error, CT.CacheF> => {
    return pipe(
      items,
      A.reduce(
        E.of<Error, CT.CacheF>(cache),
        (cache, detail) => pipe(cache, E.chain(putItem(detail))),
      ),
    )
  }

export const putEntities = (
  es: CT.CacheEntity[],
): ((cache: CT.CacheF) => E.Either<Error, CT.CacheF>) => {
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
  details: T.Details,
): ((cache: CT.CacheF) => E.Either<Error, CT.CacheF>) => {
  cacheLogger.debug(
    `putting ${details.drivewsid} ${T.fileName(details)} etag: ${
      T.isTrashDetailsG(details) ? 'trash' : details.etag
    } (${details.items.map(T.fileName)})`,
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
  item: T.DriveChildrenItem,
): ((cache: CT.CacheF) => E.Either<Error, CT.CacheF>) => {
  const shouldBeUpdated = (cached: O.Option<CT.CacheEntityWithParentId>) => {
    return O.isNone(cached)
      || cached.value.content.etag !== item.etag
      || !cached.value.hasDetails
  }

  const res = (cache: CT.CacheF) =>
    pipe(
      E.Do,
      E.bind('parentPath', () =>
        pipe(
          cache,
          getByIdE(item.parentId),
          E.mapLeft(() =>
            MissingParentError.create(
              `putItem: missing parent ${item.parentId} in cache while putting ${T.fileName(item)}`,
            )
          ),
        )),
      E.bind('cachedEntity', () => pipe(cache, getItemById(item.drivewsid))),
      E.bind(
        'needsUpdate',
        ({ cachedEntity }) => E.of(shouldBeUpdated(cachedEntity)),
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

export const getByPath = <R extends T.Root>(
  root: T.Root,
  path: NormalizedPath,
) =>
  (cache: CT.CacheF): E.Either<Error, HierarchyResult<R>> => {
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

export const getFolderById = (drivewsid: string) =>
  (cache: CT.CacheF) => {
    return pipe(
      cache,
      getById(drivewsid),
      O.map(
        flow(
          E.fromPredicate(CT.isFolderLikeCacheEntity, () => err(`getFolderById: ${drivewsid} is not a folder`)),
        ),
      ),
    )
  }

export const getFolderDetailsById = (
  drivewsid: string,
) =>
  (cache: CT.CacheF): O.Option<
    E.Either<Error, CT.CacheEntityFolderRootDetails | CT.CacheEntityFolderDetails | CT.CacheEntityAppLibraryDetails>
  > =>
    pipe(
      cache,
      getFolderById(drivewsid),
      O.chain(
        flow(E.fold(
          err => O.some(E.left(err)),
          flow(O.fromPredicate(CT.isDetailsCacheEntity), O.map(E.of)),
        )),
      ),
    )

export const getFolderDetailsByIdsSeparated = (
  drivewsids: string[],
) =>
  (cache: CT.CacheF): E.Either<
    Error,
    {
      missed: string[]
      cached:
        readonly (CT.CacheEntityFolderRootDetails | CT.CacheEntityFolderDetails | CT.CacheEntityAppLibraryDetails)[]
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
  (cache: CT.CacheF): E.Either<Error, T.MaybeNotFound<T.Details>[]> => {
    return pipe(
      drivewsids,
      A.map(id => getFolderDetailsById(id)(cache)),
      A.map(O.fold(() => E.right<Error, T.MaybeNotFound<T.Details>>(T.invalidId), E.map(v => v.content))),
      E.sequenceArray,
      E.map(RA.toArray),
    )
  }

export const getFolderByIdE = (drivewsid: string) =>
  (cache: CT.CacheF) => {
    return pipe(
      getByIdE(drivewsid)(cache),
      E.chain(flow(
        E.fromPredicate(
          CT.isFolderLikeCacheEntity,
          () => err(`getFolderByIdE: ${drivewsid} is not a folder`),
        ),
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
  (cache: CT.CacheF): Cache =>
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

// TODO
export const validateCacheJson = (json: unknown): json is CT.CacheF => {
  return isObjectWithOwnProperty(json, 'byDrivewsid')
}

export const tryReadFromFile = (
  accountDataFilePath: string,
): TE.TaskEither<Error, CT.CacheF> => {
  return pipe(
    tryReadJsonFile(accountDataFilePath),
    TE.filterOrElseW(
      validateCacheJson,
      () => TypeDecodingError.create([], 'wrong ICloudDriveCache json'),
    ),
  )
}
