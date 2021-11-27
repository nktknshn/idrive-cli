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
import { hierarchyToPath } from '../../../cli/actions/helpers'
import { err } from '../../../lib/errors'
import { cacheLogger, logg, logger, logReturnAs } from '../../../lib/logging'
import { cast, hasOwnProperty, isObjectWithOwnProperty } from '../../../lib/util'
import { FolderLikeMissingDetailsError, ItemIsNotFolder, MissinRootError, NotFoundError } from '../errors'
import { fileName, parsePath } from '../helpers'
import {
  DriveChildrenItem,
  DriveChildrenItemAppLibrary,
  DriveChildrenItemFile,
  DriveChildrenItemFolder,
  DriveDetails,
  DriveDetailsAppLibrary,
  DriveDetailsFolder,
  DriveDetailsRoot,
  Hierarchy,
  InvalidId,
  isFolderDetails,
  isRootDetails,
} from '../types'
import { rootDrivewsid } from '../types-io'
import { MissingParentError } from './errors'
import {
  CacheEntityAppLibrary,
  CacheEntityAppLibraryDetails,
  CacheEntityAppLibraryItem,
  CacheEntityDetails,
  CacheEntityFile,
  CacheEntityFolderDetails,
  CacheEntityFolderItem,
  CacheEntityFolderLike as CacheEntityFolderLike,
  CacheEntityFolderRootDetails,
  ICloudDriveCache,
  ICloudDriveCacheEntity,
} from './types'

// import * as C from '../cache/'

class lens {
  // public static root = m.Lens.fromProp<ICloudDriveCache>()('root')
  // public static byPath = m.Lens.fromProp<ICloudDriveCache>()('byPath')
  public static byDrivewsid = m.Lens.fromProp<ICloudDriveCache>()('byDrivewsid')
  // export const update = byPath.compose(byDrivewsid)
}

export const cachef = (): ICloudDriveCache => ({
  byDrivewsid: {},
})

export const itemsToHierarchy = (items: (DriveDetails | DriveChildrenItem)[]): Hierarchy => {
  return pipe(
    items,
    A.map(item =>
      isRootDetails(item) ? ({ drivewsid: rootDrivewsid }) : ({
        drivewsid: item.drivewsid,
        etag: item.etag,
        name: item.name,
        extension: item.extension,
      })
    ),
  )
}

export const entitiesToHierarchy = (entities: ICloudDriveCacheEntity[]): Hierarchy => {
  return pipe(
    entities,
    A.map(_ => _.content),
    itemsToHierarchy,
  )
}

export const getItemWithParentsById = (drivewsid: string) =>
  (cache: ICloudDriveCache): E.Either<Error, NA.NonEmptyArray<ICloudDriveCacheEntity>> => {
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
  | DriveDetailsRoot
  | DriveDetailsFolder
  | DriveDetailsAppLibrary
  | DriveChildrenItemFolder
  | DriveChildrenItemAppLibrary
  | DriveChildrenItemFile
)

export const extractCacheById = (drivewsid: string) =>
  (cache: ICloudDriveCache): E.Either<Error, ICloudDriveCache> => {
    return pipe(
      cache,
      getItemWithParentsById(drivewsid),
      E.map(NA.reverse),
      E.chain(ds => putEntities(ds)(cache)),
    )
  }

const getHierarchyById = (drivewsid: string) =>
  (cache: ICloudDriveCache): E.Either<Error, Hierarchy> => {
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
  (cache: ICloudDriveCache): E.Either<Error, string> => {
    return pipe(
      getHierarchyById(drivewsid)(cache),
      E.map(hierarchyToPath),
    )
  }

export const getRoot = () =>
  (cache: ICloudDriveCache): E.Either<Error, CacheEntityFolderRootDetails> =>
    pipe(
      cache.byDrivewsid,
      R.lookup(rootDrivewsid),
      E.fromOption(() => MissinRootError.create(`missing root`)),
      E.filterOrElse(isRootCacheEntity, () => err('invalid root details')),
    )

export const getRootO = () =>
  (cache: ICloudDriveCache): O.Option<CacheEntityFolderRootDetails> =>
    pipe(
      cache,
      getRoot(),
      O.fromEither,
    )

const assertFolderWithDetails = (entity: ICloudDriveCacheEntity) =>
  pipe(
    E.of(entity),
    E.filterOrElse(isFolderLikeCacheEntity, p => ItemIsNotFolder.create(`${p.content.drivewsid} is not a folder`)),
    E.filterOrElse(isDetailsCacheEntity, p =>
      FolderLikeMissingDetailsError.create(`${p.content.drivewsid} is missing details`)),
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
  (cache: ICloudDriveCache) =>
    pipe(
      cache,
      getById(parentId),
      E.fromOption(() => err(`zipPathWithItems: missing parent`)),
      E.chain(assertFolderWithDetails),
    )

export type PartialValidPath =
  | {
    valid: true
    entities: NA.NonEmptyArray<ICloudDriveCacheEntity>
    last: ICloudDriveCacheEntity
  }
  | {
    valid: false
    validPart: CacheEntityFolderLike[]
    rest: NA.NonEmptyArray<string>
    error: Error
  }

export const isNonEmpty = <T>(as: T[]): as is NA.NonEmptyArray<T> => as.length > 0

export const getPartialValidPath = (
  path: string[],
  parentEntity: CacheEntityFolderLike,
) =>
  (cache: ICloudDriveCache): PartialValidPath => {
    logger.debug(
      `getPartialValidPath. path=${path}, parent=${parentEntity.content.drivewsid} ${
        fileName(parentEntity.content)
      } ${parentEntity.hasDetails}`,
    )

    const getItem = (
      validPath: NA.NonEmptyArray<ICloudDriveCacheEntity>,
      name: string,
    ) =>
      pipe(
        validPath,
        NA.last,
        assertFolderWithDetails,
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
          getItem(p.entities, name),
          E.map(item =>
            NA.getSemigroup<ICloudDriveCacheEntity>()
              .concat(p.entities, NA.of(item))
          ),
          E.fold(
            (e): PartialValidPath =>
              pipe(
                // logg(`e: ${e}`),
                {
                  valid: false,
                  error: e,
                  rest: (ItemIsNotFolder.is(e) || FolderLikeMissingDetailsError.is(e)
                    ? pipe(path, A.dropLeft(p.entities.length - 2))
                    : pipe(path, A.dropLeft(p.entities.length - 1))) as NA.NonEmptyArray<string>,
                  validPart: (ItemIsNotFolder.is(e) || FolderLikeMissingDetailsError.is(e)
                    ? pipe(p.entities, A.dropRight(1))
                    : p.entities) as NA.NonEmptyArray<CacheEntityFolderLike>,
                },
              ),
            (path): PartialValidPath => ({ valid: true, entities: path, last: NA.last(path) }),
          ),
        )

    return pipe(path, A.reduce(initial, reducer))
  }

export const getByPath = (path: string) =>
  (cache: ICloudDriveCache): E.Either<Error, ICloudDriveCacheEntity> => {
    const [, ...itemsNames] = parsePath(path)

    return pipe(
      itemsNames,
      A.reduceWithIndex(
        pipe(cache, getRoot(), E.map(cast<ICloudDriveCacheEntity>())),
        (index, parentFolder, itemName) =>
          pipe(
            E.Do,
            E.bind('folder', () => pipe(parentFolder, E.chain(assertFolderWithDetails))),
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
  entity: ICloudDriveCacheEntity,
): entity is CacheEntityFolderRootDetails => entity.type === 'ROOT'

export const isFolderLikeCacheEntity = (
  entity: ICloudDriveCacheEntity,
): entity is CacheEntityFolderLike => isFolderLikeType(entity.type)

export const isDetailsCacheEntity = (
  entity: ICloudDriveCacheEntity,
): entity is CacheEntityFolderRootDetails | CacheEntityFolderDetails | CacheEntityAppLibraryDetails =>
  isFolderLikeCacheEntity(entity) && entity.hasDetails

export const isFolderLikeType = (
  type: ICloudDriveCacheEntity['type'],
): type is (CacheEntityFolderLike | CacheEntityAppLibrary)['type'] => type !== 'FILE'

export const cacheEntityFromDetails = (
  details: DriveDetails,
): ICloudDriveCacheEntity =>
  isRootDetails(details)
    ? new CacheEntityFolderRootDetails(details)
    : details.type === 'FOLDER'
    ? new CacheEntityFolderDetails(details)
    : new CacheEntityAppLibraryDetails(details)

const cacheEntityFromItem = (
  item: DriveChildrenItem,
): ICloudDriveCacheEntity => {
  return item.type === 'FILE'
    ? new CacheEntityFile(item)
    : item.type === 'FOLDER'
    ? new CacheEntityFolderItem(item)
    : new CacheEntityAppLibraryItem(item)
}

const getById = (drivewsid: string) =>
  (cache: ICloudDriveCache): O.Option<ICloudDriveCacheEntity> => {
    return pipe(cache.byDrivewsid, R.lookup(drivewsid))
  }

const getByIdE = (drivewsid: string) =>
  (cache: ICloudDriveCache): E.Either<Error, ICloudDriveCacheEntity> => {
    return pipe(cache, getById(drivewsid), E.fromOption(() => NotFoundError.create(`missing ${drivewsid}`)))
  }

const addItems = (items: DriveChildrenItem[]) =>
  (cache: ICloudDriveCache): E.Either<Error, ICloudDriveCache> => {
    return pipe(
      items,
      A.reduce(E.of(cache), (acc, cur) => pipe(acc, E.chain(putItem(cur)))),
    )
  }

export const putRoot = (
  details: DriveDetailsRoot,
): ((s: ICloudDriveCache) => E.Either<Error, ICloudDriveCache>) => {
  return flow(
    lens.byDrivewsid.modify(
      R.upsertAt(rootDrivewsid, cacheEntityFromDetails(details)),
    ),
    addItems(details.items),
  )
}

export const removeById = (drivewsid: string) =>
  (cache: ICloudDriveCache) =>
    pipe(
      cache,
      lens.byDrivewsid.modify(R.deleteAt(drivewsid)),
    )

export const putDetailss = (
  detailss: DriveDetails[],
): ((cache: ICloudDriveCache) => E.Either<Error, ICloudDriveCache>) => {
  return cache =>
    pipe(
      detailss,
      A.reduce(E.of(cache), (c, d) => pipe(c, E.chain(putDetails(d)))),
    )
}

export const putEntities = (
  es: ICloudDriveCacheEntity[],
): ((cache: ICloudDriveCache) => E.Either<Error, ICloudDriveCache>) => {
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
  details: DriveDetails,
): ((cache: ICloudDriveCache) => E.Either<Error, ICloudDriveCache>) => {
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
          addItems(details.items),
        )
      ),
    )
}

export const putItem = (
  item: DriveChildrenItem,
): ((cache: ICloudDriveCache) => E.Either<Error, ICloudDriveCache>) => {
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

export const validateCacheJson = (json: unknown): json is ICloudDriveCache => {
  return isObjectWithOwnProperty(json, 'byDrivewsid')
}
