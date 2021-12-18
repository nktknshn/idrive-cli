import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { constant, flow, identity, pipe } from 'fp-ts/lib/function'
import { URIS } from 'fp-ts/lib/HKT'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import { snd } from 'fp-ts/lib/ReadonlyTuple'
import * as R from 'fp-ts/lib/Record'
import { fst } from 'fp-ts/lib/Tuple'
import * as m from 'monocle-ts'
import Path from 'path'
import { hierarchyToPath } from '../../../cli/cli-drive/cli-drive-actions/helpers'
import { err } from '../../../lib/errors'
import { cacheLogger, logg, logger, logReturnAs } from '../../../lib/logging'
import { cast, hasOwnProperty, isObjectWithOwnProperty } from '../../../lib/util'
import { FolderLikeMissingDetailsError, ItemIsNotFolderError, MissinRootError, NotFoundError } from '../errors'
import { parsePath } from '../helpers'
import {
  Details,
  DetailsAppLibrary,
  DetailsFolder,
  DetailsRoot,
  DriveChildrenItem,
  DriveChildrenItemAppLibrary,
  DriveChildrenItemFile,
  DriveChildrenItemFolder,
  fileName,
  Hierarchy,
  HierarchyEntry,
  InvalidId,
  isDetails,
  isFolderLike,
  isFolderLikeItem,
  isRootDetails,
} from '../types'
import { hierarchyRoot, hierarchyTrash, rootDrivewsid, trashDrivewsid } from '../types-io'
import { MissingParentError } from './errors'
import {
  CacheEntity,
  CacheEntityAppLibrary,
  CacheEntityAppLibraryDetails,
  CacheEntityAppLibraryItem,
  CacheEntityFile,
  CacheEntityFolderDetails,
  CacheEntityFolderItem,
  CacheEntityFolderLike as CacheEntityFolderLike,
  CacheEntityFolderRootDetails,
  CacheF,
} from './types'

// import * as C from '../cache/'

class lens {
  // public static root = m.Lens.fromProp<ICloudDriveCache>()('root')
  // public static byPath = m.Lens.fromProp<ICloudDriveCache>()('byPath')
  public static byDrivewsid = m.Lens.fromProp<CacheF>()('byDrivewsid')
  // export const update = byPath.compose(byDrivewsid)
}

export const cachef = (): CacheF => ({
  byDrivewsid: {},
})

export const itemsToHierarchy = (items: (HierarchyEntry)[]): Hierarchy => {
  return pipe(
    items,
    A.map(item =>
      hierarchyRoot.is(item)
        ? ({ drivewsid: rootDrivewsid })
        : hierarchyTrash.is(item)
        ? ({ drivewsid: trashDrivewsid })
        : ({
          drivewsid: item.drivewsid,
          etag: item.etag,
          name: item.name,
          extension: item.extension,
        })
    ),
  )
}

export const entitiesToHierarchy = (entities: CacheEntity[]): Hierarchy => {
  return pipe(
    entities,
    A.map(_ => _.content),
    itemsToHierarchy,
  )
}

export const getItemWithParentsById = (drivewsid: string) =>
  (cache: CacheF): E.Either<Error, NA.NonEmptyArray<CacheEntity>> => {
    let item = pipe(
      cache.byDrivewsid,
      R.lookup(drivewsid),
    )

    if (O.isNone(item)) {
      return E.left(err(`missing ${drivewsid} in cache`))
    }

    let result = NA.of(item.value)

    while (
      !isRootCacheEntity(item.value)
      // && !isTrash
    ) {
      item = pipe(
        cache.byDrivewsid,
        R.lookup(item.value.content.parentId),
      )

      if (!O.isSome(item)) {
        return E.left(err(`missing ${drivewsid} in cache`))
      }

      result.push(item.value)
    }

    return pipe(
      getRoot()(cache),
      E.map(
        root =>
          pipe(
            NA.of(root),
            NA.concat(result),
          ),
      ),
    )
  }

type CacheContent = (
  | DetailsRoot
  | DetailsFolder
  | DetailsAppLibrary
  | DriveChildrenItemFolder
  | DriveChildrenItemAppLibrary
  | DriveChildrenItemFile
)

export const extractCacheById = (drivewsid: string) =>
  (cache: CacheF): E.Either<Error, CacheF> => {
    return pipe(
      cache,
      getItemWithParentsById(drivewsid),
      E.map(NA.reverse),
      E.chain(ds => putEntities(ds)(cache)),
    )
  }

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

export const assertFolderWithDetails = (
  entity: Details | DriveChildrenItem,
): E.Either<Error, Details> =>
  pipe(
    E.of(entity),
    E.filterOrElse(
      isFolderLike,
      p => ItemIsNotFolderError.create(`assertFolderWithDetails: ${p.drivewsid} is not a folder`),
    ),
    E.filterOrElse(isDetails, p => FolderLikeMissingDetailsError.create(`${p.drivewsid} is missing details`)),
  )

const getSubItemByName = (
  itemName: string,
) =>
  (
    parent: CacheEntityFolderRootDetails | CacheEntityFolderDetails | CacheEntityAppLibraryDetails,
  ): O.Option<DriveChildrenItem> =>
    pipe(
      parent.content.items,
      A.findFirst(item => fileName(item) === itemName),
    )

const getParent = (parentId: string) =>
  (cache: CacheF) =>
    pipe(
      cache,
      getById(parentId),
      E.fromOption(() => err(`zipPathWithItems: missing parent`)),
      E.chain(assertFolderWithDetailsEntity),
    )

export type PartialValidPathValid<T = CacheEntityDetails | CacheEntityFile> = {
  valid: true
  entities: NA.NonEmptyArray<T>
  last: T
}

export type PartialValidPathInvalid<F = CacheEntityDetails> = {
  valid: false
  validPart: F[]
  rest: NA.NonEmptyArray<string>
  error: Error
}

export type PartialValidPath<T = CacheEntityDetails | CacheEntityFile, F = CacheEntityDetails> =
  | PartialValidPathValid<T>
  | PartialValidPathInvalid<F>

/*
  valid path is a sequence of details with the last element being and item
*/
export const isNonEmpty = <T>(as: T[]): as is NA.NonEmptyArray<T> => as.length > 0

export const getPartialValidPath = (
  path: string[],
  parentEntity: CacheEntityDetails,
) =>
  (cache: CacheF): PartialValidPath => {
    cacheLogger.debug(
      `getPartialValidPath. path=${path}, parent=${parentEntity.content.drivewsid} ${
        fileName(parentEntity.content)
      } ${parentEntity.hasDetails}`,
    )

    const getItem = (
      parent: CacheEntityDetails,
      name: string,
    ): E.Either<Error, CacheEntity> =>
      pipe(
        E.of(parent),
        E.map(getSubItemByName(name)),
        E.chain(E.fromOption(() => err(`missing ${name}`))),
        E.chain(_ => getByIdE(_.drivewsid)(cache)),
      )

    const initial: PartialValidPath = ({
      valid: true,
      entities: NA.of(parentEntity),
      last: parentEntity,
    })

    const reducer = (p: PartialValidPath, name: string): PartialValidPath =>
      !p.valid
        ? p
        : pipe(
          NA.last(p.entities),
          assertFolderWithDetailsEntity,
          E.chain(parent => getItem(parent, name)),
          E.chain(item =>
            isFolderLikeCacheEntity(item)
              ? pipe(getFolderDetailsByIdE(item.content.drivewsid)(cache))
              : E.of<Error, CacheEntityFile | CacheEntityDetails>(item)
          ),
          E.map(item =>
            NA.getSemigroup<CacheEntityFile | CacheEntityDetails>()
              .concat(p.entities, NA.of(item))
          ),
          E.fold(
            (e): PartialValidPath =>
              pipe(
                {
                  valid: false,
                  error: e,
                  rest: (ItemIsNotFolderError.is(e) || FolderLikeMissingDetailsError.is(e)
                    ? pipe(path, A.dropLeft(p.entities.length - 2))
                    : pipe(path, A.dropLeft(p.entities.length - 1))) as NA.NonEmptyArray<string>,
                  validPart: (ItemIsNotFolderError.is(e) || FolderLikeMissingDetailsError.is(e)
                    ? pipe(p.entities, A.dropRight(1))
                    : p.entities) as NA.NonEmptyArray<CacheEntityDetails>,
                },
              ),
            (path): PartialValidPath => ({
              valid: true,
              entities: path,
              last: NA.last(path),
            }),
          ),
        )

    return pipe(path, A.reduce(initial, reducer))
  }

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

export const isRootCacheEntity = (
  entity: CacheEntity,
): entity is CacheEntityFolderRootDetails => entity.type === 'ROOT'

export const isFolderLikeCacheEntity = (
  entity: CacheEntity,
): entity is CacheEntityFolderLike => isFolderLikeType(entity.type)

export type CacheEntityDetails = CacheEntityFolderRootDetails | CacheEntityFolderDetails | CacheEntityAppLibraryDetails

export const isDetailsCacheEntity = (
  entity: CacheEntity,
): entity is CacheEntityFolderRootDetails | CacheEntityFolderDetails | CacheEntityAppLibraryDetails =>
  isFolderLikeCacheEntity(entity) && entity.hasDetails

export const isFolderLikeType = (
  type: CacheEntity['type'],
): type is (CacheEntityFolderLike | CacheEntityAppLibrary)['type'] => type !== 'FILE'

export const cacheEntityFromDetails = (
  details: Details,
): CacheEntity =>
  isRootDetails(details)
    ? new CacheEntityFolderRootDetails(details)
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
    `putting ${details.drivewsid} ${fileName(details)} ${details.etag} (${details.items.map(fileName)})`,
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
  return (cache) =>
    pipe(
      E.Do,
      E.bind('parentPath', () =>
        pipe(
          cache,
          // logReturnAs('cache'),
          getCachedPathForId(item.parentId),
          E.mapLeft(() => MissingParentError.create(`putItem: missing parent ${item.parentId} in cache`)),
        )),
      E.bind('cachedEntity', () => E.of(pipe(cache, getById(item.drivewsid)))),
      E.bind('needsUpdate', ({ cachedEntity }) =>
        E.of(
          O.isNone(cachedEntity)
            || cachedEntity.value.content.etag !== item.etag
            || !cachedEntity.value.hasDetails,
        )),
      // E.map(logReturn(_ => cacheLogger.debug({ ..._, item }))),
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
}

export const validateCacheJson = (json: unknown): json is CacheF => {
  return isObjectWithOwnProperty(json, 'byDrivewsid')
}
