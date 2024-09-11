import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as R from 'fp-ts/lib/Record'
import * as m from 'monocle-ts'
import { cacheLogger } from '../../../logging/logging'
import { err } from '../../../util/errors'
import { NormalizedPath } from '../../../util/normalize-path'
import { NEA } from '../../../util/types'
import * as T from '../../drive-types'
import { rootDrivewsid, trashDrivewsid } from '../../drive-types/types-io'
import * as GetByPath from '../../util/get-by-path-types'
import { MissingRootError, NotFoundError } from '../errors'
import { getFromCacheByPath } from './cache-get-by-path'
import { cacheEntityFromDetails, hierarchyToPath, parsePath } from './cache-helpers'
import * as CT from './cache-types'
export * from './cache-file'
export * from './cache-tree'

export type LookupCache = CT.Cache

class lens {
  public static byDrivewsid = m.Lens.fromProp<CT.Cache>()('byDrivewsid')
}

export const cache = (): CT.Cache => ({
  byDrivewsid: {},
})

export const getDocwsRoot = (cache: CT.Cache): E.Either<MissingRootError, CT.CacheEntityFolderRootDetails> =>
  pipe(
    cache.byDrivewsid,
    R.lookup(rootDrivewsid),
    E.fromOption(() => MissingRootError.create(`getDocwsRootE(): missing root`)),
    E.filterOrElse(CT.isDocwsRootCacheEntity, () => err('getDocwsRootE(): invalid root details')),
  )

export const getTrash = (cache: CT.Cache): E.Either<Error, CT.CacheEntityFolderTrashDetails> =>
  pipe(
    cache.byDrivewsid,
    R.lookup(trashDrivewsid),
    E.fromOption(() => MissingRootError.create(`getTrashE(): missing trash`)),
    E.filterOrElse(CT.isTrashCacheEntity, () => err('getTrashE(): invalid trash details')),
  )

export const getAllDetails = (
  cache: CT.Cache,
): (T.DetailsDocwsRoot | T.DetailsFolder | T.DetailsAppLibrary | T.DetailsTrashRoot)[] => {
  return pipe(
    Object.values(cache.byDrivewsid),
    // A.filter(CT.isDetailsCacheEntity),
    A.map(_ => _.content),
  )
}

export const getByIdO = (drivewsid: string) =>
  (cache: CT.Cache): O.Option<CT.CacheEntity> => {
    return pipe(cache.byDrivewsid, R.lookup(drivewsid))
  }

export const getByIdE = (drivewsid: string) =>
  (cache: CT.Cache): E.Either<NotFoundError, CT.CacheEntity> => {
    return pipe(
      getByIdO(drivewsid)(cache),
      E.fromOption(() => NotFoundError.create(`getByIdE: missing ${drivewsid}`)),
    )
  }

export const getFolderDetailsByIdE = (drivewsid: string) =>
  (cache: CT.Cache): E.Either<Error, CT.CacheEntity> => {
    return pipe(
      getByIdO(drivewsid)(cache),
      E.fromOption(() => NotFoundError.create(`missing ${drivewsid}`)),
    )
  }

export const getByPathStrict = <R extends T.Root>(
  root: R,
  path: NormalizedPath,
) =>
  (cache: CT.Cache): E.Either<Error, T.DetailsFolder | T.DetailsAppLibrary | R | T.DriveChildrenItemFile> =>
    pipe(
      getByPath(root, path)(cache),
      GetByPath.asEither((res) => err(GetByPath.showGetByPathResult(res))),
    )

export const getByPath = <R extends T.Root>(
  root: R,
  path: NormalizedPath,
) =>
  (cache: CT.Cache): GetByPath.Result<R> => {
    const parts = parsePath(path)
    const rest = NA.tail(parts)

    return getFromCacheByPath(rest, root)(cache)
  }

export const getByPaths = <R extends T.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
) =>
  (cache: CT.Cache): NEA<GetByPath.Result<R>> => {
    return pipe(
      paths,
      NA.map(path => getByPath<R>(root, path)(cache)),
    )
  }

/** Retrieves details for the given ids from the cache. Includes ids that were not found in the cache. */
export const getFoldersDetailsByIdsSeparated = (
  drivewsids: string[],
) =>
  (cache: CT.Cache): { missed: string[]; cached: readonly (CT.CacheEntity)[] } =>
    pipe(
      drivewsids,
      A.map(id => pipe(cache, getByIdO(id), E.fromOption(() => id))),
      A.separate,
      ({ left: missed, right: cached }) => ({ missed, cached }),
    )

export const getFoldersDetailsByIds = (
  drivewsids: NEA<string>,
) =>
  (cache: CT.Cache): NEA<T.MaybeInvalidId<T.Details>> => {
    return pipe(
      drivewsids,
      NA.map(id => getByIdO(id)(cache)),
      NA.map(O.fold((): T.MaybeInvalidId<T.Details> => T.invalidId, v => v.content)),
    )
  }

export const getHierarchyById = (drivewsid: string) =>
  (cache: CT.Cache): E.Either<NotFoundError, T.Hierarchy> => {
    const h: T.Hierarchy = []

    let item = pipe(
      cache.byDrivewsid,
      R.lookup(drivewsid),
    )

    while (O.isSome(item)) {
      if (CT.isDocwsRootCacheEntity(item.value)) {
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

    return E.left(NotFoundError.create(`getHierarchyById: missing ${drivewsid} in cache`))
  }

export const getCachedPathForId = (drivewsid: string) =>
  (cache: CT.Cache): E.Either<NotFoundError, string> => {
    return pipe(
      getHierarchyById(drivewsid)(cache),
      E.map(hierarchyToPath),
    )
  }

export const getByIdWithPath = (drivewsid: string) =>
  (cache: LookupCache): E.Either<Error, {
    readonly entity: CT.CacheEntity
    readonly path: string
  }> =>
    pipe(
      E.Do,
      E.bind('entity', () => getByIdE(drivewsid)(cache)),
      E.bind('path', () => getCachedPathForId(drivewsid)(cache)),
    )

export const removeById = (drivewsid: string): (cache: CT.Cache) => CT.Cache =>
  (cache: CT.Cache) => pipe(cache, lens.byDrivewsid.modify(R.deleteAt(drivewsid)))

export const createWithDetailss = (detailss: T.Details[]): CT.Cache =>
  pipe(
    cache(),
    putDetailss(detailss),
  )

export const putDetailss = (
  detailss: T.Details[],
): ((cache: CT.Cache) => CT.Cache) => {
  return cache => {
    cacheLogger.debug(`putDetailss(${detailss.length} items)`)
    return pipe(
      detailss,
      A.reduce(cache, (c, d) => pipe(c, putDetails(d))),
    )
  }
}

export const putDetails = (
  details: T.Details,
): ((cache: CT.Cache) => CT.Cache) => {
  cacheLogger.silly(
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
  )
}

export const removeByIds = (drivewsids: string[]) =>
  (cache: CT.Cache): LookupCache =>
    pipe(
      drivewsids,
      A.reduce(cache, (cache, cur) => removeById(cur)(cache)),
    )

/** Concatenate two lookup caches */
export function concat(c1: LookupCache): (c2: LookupCache) => CT.Cache
export function concat(c1: LookupCache, c2: LookupCache): CT.Cache
export function concat(c1: LookupCache, c2?: LookupCache): CT.Cache | ((c2: LookupCache) => CT.Cache) {
  return c2 ? pipe(c1, putDetailss(getAllDetails(c2))) : c2 => concat(c1, c2)
}

export const keysCount = (cache: CT.Cache): number => Object.keys(cache.byDrivewsid).length
export const keys = (cache: CT.Cache): string[] => Object.keys(cache.byDrivewsid)
export const keysString = (cache: CT.Cache): string => Object.keys(cache.byDrivewsid).join(', ')

export const keysAddRemove = (old: CT.Cache, newCache: CT.Cache): { added: string[]; removed: string[] } => {
  const oldKeys = keys(old)
  const newKeys = keys(newCache)

  const added = newKeys.filter(k => !oldKeys.includes(k))
  const removed = oldKeys.filter(k => !newKeys.includes(k))

  return { added, removed }
}
