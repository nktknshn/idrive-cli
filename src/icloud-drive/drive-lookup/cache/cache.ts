import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as R from 'fp-ts/lib/Record'
import * as m from 'monocle-ts'
import { err } from '../../../util/errors'
import { cacheLogger } from '../../../util/logging'
import { NormalizedPath } from '../../../util/normalize-path'
import { NEA } from '../../../util/types'
import { sequenceArrayNEA } from '../../../util/util'
import * as T from '../../icloud-drive-items-types'
import { rootDrivewsid, trashDrivewsid } from '../../icloud-drive-items-types/types-io'
import { GetByPathResult } from '../../util/get-by-path-types'
import { ItemIsNotFolderError, MissinRootError, NotFoundError } from '../errors'
import { getFromCacheByPath } from './cache-get-by-path'
import {
  assertFolderWithDetailsEntity,
  cacheEntityFromDetails,
  // cacheEntityFromItem,
  hierarchyToPath,
  parsePath,
} from './cache-helpers'
import * as CT from './cache-types'
export * from './cache-file'

export type Cache = CT.CacheF

class lens {
  public static byDrivewsid = m.Lens.fromProp<CT.CacheF>()('byDrivewsid')
}

export const cachef = (): CT.CacheF => ({
  byDrivewsid: {},
})

export const getDocwsRoot = (cache: CT.CacheF): E.Either<MissinRootError, CT.CacheEntityFolderRootDetails> =>
  pipe(
    cache.byDrivewsid,
    R.lookup(rootDrivewsid),
    E.fromOption(() => MissinRootError.create(`getDocwsRootE(): missing root`)),
    E.filterOrElse(CT.isDocwsRootCacheEntity, () => err('getDocwsRootE(): invalid root details')),
  )

export const getTrash = (cache: CT.CacheF): E.Either<Error, CT.CacheEntityFolderTrashDetails> =>
  pipe(
    cache.byDrivewsid,
    R.lookup(trashDrivewsid),
    E.fromOption(() => MissinRootError.create(`getTrashE(): missing trash`)),
    E.filterOrElse(CT.isTrashCacheEntity, () => err('getTrashE(): invalid trash details')),
  )

export const getAllDetails = (
  cache: CT.CacheF,
): (T.DetailsDocwsRoot | T.DetailsFolder | T.DetailsAppLibrary | T.DetailsTrashRoot)[] => {
  return pipe(
    Object.values(cache.byDrivewsid),
    A.filter(CT.isDetailsCacheEntity),
    A.map(_ => _.content),
  )
}

export const getByIdO = (drivewsid: string) =>
  (cache: CT.CacheF): O.Option<CT.CacheEntity> => {
    return pipe(cache.byDrivewsid, R.lookup(drivewsid))
  }

export const getByIdE = (drivewsid: string) =>
  (cache: CT.CacheF): E.Either<NotFoundError, CT.CacheEntity> => {
    return pipe(
      getByIdO(drivewsid)(cache),
      E.fromOption(() => NotFoundError.create(`getByIdE: missing ${drivewsid}`)),
    )
  }

export const getFolderDetailsByIdE = (drivewsid: string) =>
  (cache: CT.CacheF): E.Either<Error, CT.CacheEntityDetails> => {
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
  (cache: CT.CacheF): GetByPathResult<R> => {
    const parts = parsePath(path)
    const rest = NA.tail(parts)

    return getFromCacheByPath(rest, root)(cache)
  }

export const getByPaths = <R extends T.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
) =>
  (cache: CT.CacheF): NEA<GetByPathResult<R>> => {
    return pipe(
      paths,
      NA.map(path => getByPath<R>(root, path)(cache)),
    )
  }

export const getFolderByIdO = (drivewsid: string) =>
  (cache: CT.CacheF): O.Option<
    E.Either<ItemIsNotFolderError, CT.CacheEntityFolderLike>
  > => {
    return pipe(
      cache,
      getByIdO(drivewsid),
      O.map(
        flow(
          E.fromPredicate(CT.isFolderLikeCacheEntity, () =>
            ItemIsNotFolderError.create(`getFolderById: ${drivewsid} is not a folder`)),
        ),
      ),
    )
  }

export const getFolderDetailsByIdO = (
  drivewsid: string,
) =>
  (cache: CT.CacheF): O.Option<
    E.Either<ItemIsNotFolderError, CT.CacheEntityDetails>
  > =>
    pipe(
      cache,
      getFolderByIdO(drivewsid),
      O.chain(
        flow(E.fold(
          err => O.some(E.left(err)),
          flow(O.fromPredicate(CT.isDetailsCacheEntity), O.map(E.of)),
        )),
      ),
    )

export const getFoldersDetailsByIdsSeparated = (
  drivewsids: string[],
) =>
  (cache: CT.CacheF): E.Either<
    ItemIsNotFolderError,
    {
      missed: string[]
      cached: readonly (CT.CacheEntityDetails)[]
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
  drivewsids: NEA<string>,
) =>
  (cache: CT.CacheF): E.Either<Error, NEA<T.MaybeInvalidId<T.Details>>> => {
    return pipe(
      drivewsids,
      NA.map(id => getFolderDetailsByIdO(id)(cache)),
      NA.map(O.fold(() => E.right<Error, T.MaybeInvalidId<T.Details>>(T.invalidId), E.map(v => v.content))),
      sequenceArrayNEA,
    )
  }

export const getHierarchyById = (drivewsid: string) =>
  (cache: CT.CacheF): E.Either<NotFoundError, T.Hierarchy> => {
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
  (cache: CT.CacheF): E.Either<NotFoundError, string> => {
    return pipe(
      getHierarchyById(drivewsid)(cache),
      E.map(hierarchyToPath),
    )
  }

export const getByIdWithPath = (drivewsid: string) =>
  (cache: Cache): E.Either<Error, {
    readonly entity: CT.CacheEntity
    readonly path: string
  }> =>
    pipe(
      E.Do,
      E.bind('entity', () => getByIdE(drivewsid)(cache)),
      E.bind('path', () => getCachedPathForId(drivewsid)(cache)),
    )

export const removeById = (drivewsid: string): (cache: CT.CacheF) => CT.CacheF =>
  (cache: CT.CacheF) =>
    pipe(
      cache,
      lens.byDrivewsid.modify(R.deleteAt(drivewsid)),
    )

export const putDetailss = (
  detailss: T.Details[],
): ((cache: CT.CacheF) => CT.CacheF) => {
  return cache =>
    pipe(
      detailss,
      A.reduce(cache, (c, d) => pipe(c, putDetails(d))),
    )
}

export const putDetails = (
  details: T.Details,
): ((cache: CT.CacheF) => CT.CacheF) => {
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
  )
}

export const removeByIds = (drivewsids: string[]) =>
  (cache: CT.CacheF): Cache =>
    pipe(
      drivewsids,
      A.reduce(cache, (cache, cur) => removeById(cur)(cache)),
    )

export const concat = (c1: Cache, c2: Cache): CT.CacheF =>
  pipe(
    c1,
    putDetailss(getAllDetails(c2)),
  )
