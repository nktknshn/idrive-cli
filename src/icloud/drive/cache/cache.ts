import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
// TODO
// export const validateCacheJson = (json: unknown): json is C.CacheF => {
//   return isObjectWithOwnProperty(json, 'byDrivewsid')
// }
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import * as R from 'fp-ts/lib/Record'
import * as m from 'monocle-ts'
import { err, TypeDecodingError } from '../../../lib/errors'
import { ReadJsonFileError, tryReadJsonFile } from '../../../lib/files'
import { saveJson } from '../../../lib/json'
import { cacheLogger } from '../../../lib/logging'
import { NormalizedPath } from '../../../lib/normalize-path'
import { NEA } from '../../../lib/types'
import { DepFs } from '../deps'
import { ItemIsNotFolderError, MissinRootError, NotFoundError } from '../errors'
import { hierarchyToPath, parsePath } from '../helpers'
import * as T from '../types'
import { rootDrivewsid, trashDrivewsid } from '../types/types-io'
import { getFromCacheByPath } from './cache-get-by-path'
import { GetByPathResult } from './cache-get-by-path-types'
import { assertFolderWithDetailsEntity, cacheEntityFromDetails, cacheEntityFromItem } from './cache-helpers'
import * as cacheEntityFolderRootDetails from './cache-io-types'
import * as C from './cache-types'
import { MissingParentError } from './errors'

export type Cache = C.CacheF

class lens {
  public static byDrivewsid = m.Lens.fromProp<C.CacheF>()('byDrivewsid')
}

export const cachef = (): C.CacheF => ({
  byDrivewsid: {},
})

export const getDocwsRoot = (cache: C.CacheF): E.Either<MissinRootError, C.CacheEntityFolderRootDetails> =>
  pipe(
    cache.byDrivewsid,
    R.lookup(rootDrivewsid),
    E.fromOption(() => MissinRootError.create(`getDocwsRootE(): missing root`)),
    E.filterOrElse(C.isDocwsRootCacheEntity, () => err('getDocwsRootE(): invalid root details')),
  )

export const getTrash = (cache: C.CacheF): E.Either<Error, C.CacheEntityFolderTrashDetails> =>
  pipe(
    cache.byDrivewsid,
    R.lookup(trashDrivewsid),
    E.fromOption(() => MissinRootError.create(`getTrashE(): missing trash`)),
    E.filterOrElse(C.isTrashCacheEntity, () => err('getTrashE(): invalid trash details')),
  )

export const getByIdO = (drivewsid: string) =>
  (cache: C.CacheF): O.Option<C.CacheEntity> => {
    return pipe(cache.byDrivewsid, R.lookup(drivewsid))
  }

export const getByIdE = (drivewsid: string) =>
  (cache: C.CacheF): E.Either<NotFoundError, C.CacheEntity> => {
    return pipe(
      getByIdO(drivewsid)(cache),
      E.fromOption(() => NotFoundError.create(`getByIdE: missing ${drivewsid}`)),
    )
  }

export const getFolderDetailsByIdE = (drivewsid: string) =>
  (cache: C.CacheF): E.Either<Error, C.CacheEntityDetails> => {
    return pipe(
      getByIdO(drivewsid)(cache),
      E.fromOption(() => NotFoundError.create(`missing ${drivewsid}`)),
      E.chain(assertFolderWithDetailsEntity),
    )
  }

export const getByPath = <R extends T.Root>(
  root: R,
  path: NormalizedPath,
) =>
  (cache: C.CacheF): GetByPathResult<R> => {
    const parts = parsePath(path)
    const rest = NA.tail(parts)

    return getFromCacheByPath(rest, root)(cache)
  }

export const getByPaths = <R extends T.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
) =>
  (cache: C.CacheF): NEA<GetByPathResult<R>> => {
    return pipe(
      paths,
      NA.map(path => getByPath<R>(root, path)(cache)),
    )
  }

export const getFolderByIdO = (drivewsid: string) =>
  (cache: C.CacheF): O.Option<
    E.Either<ItemIsNotFolderError, C.CacheEntityFolderLike>
  > => {
    return pipe(
      cache,
      getByIdO(drivewsid),
      O.map(
        flow(
          E.fromPredicate(C.isFolderLikeCacheEntity, () =>
            ItemIsNotFolderError.create(`getFolderById: ${drivewsid} is not a folder`)),
        ),
      ),
    )
  }

export const getFolderDetailsByIdO = (
  drivewsid: string,
) =>
  (cache: C.CacheF): O.Option<
    E.Either<ItemIsNotFolderError, C.CacheEntityDetails>
  > =>
    pipe(
      cache,
      getFolderByIdO(drivewsid),
      O.chain(
        flow(E.fold(
          err => O.some(E.left(err)),
          flow(O.fromPredicate(C.isDetailsCacheEntity), O.map(E.of)),
        )),
      ),
    )

export const getFoldersDetailsByIdsSeparated = (
  drivewsids: string[],
) =>
  (cache: C.CacheF): E.Either<
    ItemIsNotFolderError,
    {
      missed: string[]
      cached: readonly (C.CacheEntityDetails)[]
    }
  > =>
    pipe(
      drivewsids,
      A.map(id => pipe(cache, getFolderDetailsByIdO(id), E.fromOption(() => id))),
      A.separate,
      ({ left: missed, right: cached }) =>
        pipe(
          E.sequenceArray(cached),
          E.map((cached) => ({ missed, cached })),
        ),
    )

export const getFoldersDetailsByIds = (
  drivewsids: string[],
) =>
  (cache: C.CacheF): E.Either<Error, T.MaybeInvalidId<T.Details>[]> => {
    return pipe(
      drivewsids,
      A.map(id => getFolderDetailsByIdO(id)(cache)),
      A.map(O.fold(() => E.right<Error, T.MaybeInvalidId<T.Details>>(T.invalidId), E.map(v => v.content))),
      E.sequenceArray,
      E.map(RA.toArray),
    )
  }

export const getHierarchyById = (drivewsid: string) =>
  (cache: C.CacheF): E.Either<NotFoundError, T.Hierarchy> => {
    const h: T.Hierarchy = []

    let item = pipe(
      cache.byDrivewsid,
      R.lookup(drivewsid),
    )

    while (O.isSome(item)) {
      if (C.isDocwsRootCacheEntity(item.value)) {
        h.push({ drivewsid: rootDrivewsid })
        return E.right(A.reverse(h))
      }
      else if (C.isTrashCacheEntity(item.value)) {
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

    return E.left(NotFoundError.create(`getHierarchyById: missing ${drivewsid} in cache`))
  }

export const getCachedPathForId = (drivewsid: string) =>
  (cache: C.CacheF): E.Either<NotFoundError, string> => {
    return pipe(
      getHierarchyById(drivewsid)(cache),
      E.map(hierarchyToPath),
    )
  }

export const getByIdWithPath = (drivewsid: string) =>
  (cache: Cache): E.Either<Error, {
    readonly entity: C.CacheEntity
    readonly path: string
  }> =>
    pipe(
      E.Do,
      E.bind('entity', () => getByIdE(drivewsid)(cache)),
      E.bind('path', () => getCachedPathForId(drivewsid)(cache)),
    )

const addItems = (items: T.DriveChildrenItem[]) =>
  (cache: C.CacheF): E.Either<Error, C.CacheF> => {
    return pipe(
      items,
      A.reduce(
        E.of(cache),
        (acc, cur) => pipe(acc, E.chain(putItem(cur))),
      ),
    )
  }

export const removeById = (drivewsid: string) =>
  (cache: C.CacheF) =>
    pipe(
      cache,
      lens.byDrivewsid.modify(R.deleteAt(drivewsid)),
    )

export const putDetailss = (
  detailss: T.Details[],
): ((cache: C.CacheF) => E.Either<Error, C.CacheF>) => {
  return cache =>
    pipe(
      detailss,
      A.reduce(E.of(cache), (c, d) => pipe(c, E.chain(putDetails(d)))),
    )
}

export const putDetails = (
  details: T.Details,
): ((cache: C.CacheF) => E.Either<Error, C.CacheF>) => {
  cacheLogger.debug(
    `putting ${details.drivewsid} ${T.fileName(details)} etag: ${
      T.isTrashDetailsG(details) ? 'trash' : details.etag
    } items=[${details.items.map(T.fileName)}]`,
  )

  return flow(
    lens.byDrivewsid.modify(
      R.upsertAt(
        details.drivewsid,
        cacheEntityFromDetails(details),
      ),
    ),
    addItems(details.items),
  )
}

const putItem = (
  item: T.DriveChildrenItem,
): ((cache: C.CacheF) => E.Either<Error, C.CacheF>) => {
  const shouldBeUpdated = (cached: O.Option<C.CacheEntity>) => {
    return O.isNone(cached)
      // || cached.value.content.etag !== item.etag
      || !cached.value.hasDetails
  }

  return (cache: C.CacheF) =>
    pipe(
      getByIdE(item.parentId)(cache),
      E.mapLeft(() =>
        MissingParentError.create(
          `putItem: missing parent ${item.parentId} in cache while putting ${T.fileName(item)}`,
        )
      ),
      E.map(() => {
        if (shouldBeUpdated(getByIdO(item.drivewsid)(cache))) {
          return pipe(
            cache,
            lens.byDrivewsid.modify(
              R.upsertAt(item.drivewsid, cacheEntityFromItem(item)),
            ),
          )
        }

        return cache
      }),
    )
}

export const removeByIds = (drivewsids: string[]) =>
  (cache: C.CacheF): Cache =>
    pipe(
      drivewsids,
      A.reduce(cache, (cache, cur) => removeById(cur)(cache)),
    )

export const trySaveFile = (
  cache: Cache,
) =>
  (cacheFilePath: string) => {
    cacheLogger.debug(`saving cache: ${R.keys(cache.byDrivewsid).length} items`)

    return pipe(
      cache,
      saveJson(cacheFilePath),
    )
  }

export const tryReadFromFile = (
  accountDataFilePath: string,
): RTE.ReaderTaskEither<DepFs<'readFile'>, Error | ReadJsonFileError, C.CacheF> => {
  return pipe(
    tryReadJsonFile(accountDataFilePath),
    RTE.chainEitherKW(flow(
      cacheEntityFolderRootDetails.cache.decode,
      E.mapLeft(es => TypeDecodingError.create(es, 'wrong ICloudDriveCache json')),
    )),
  )
}
