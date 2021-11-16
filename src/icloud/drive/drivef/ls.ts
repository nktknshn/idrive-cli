import { sequenceS } from 'fp-ts/lib/Apply'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { compareHierarchiesItem, compareItemWithHierarchy } from '../../../cli/actions/helpers'
import * as C from '../../../icloud/drive/cache/cachef'
import { Cache, isFolderLikeCacheEntity } from '../../../icloud/drive/cache/cachef'
import { CacheEntityFile, CacheEntityFolderLike, ICloudDriveCacheEntity } from '../../../icloud/drive/cache/types'
import { DriveApi } from '../../../icloud/drive/drive-api'
import * as DF from '../../../icloud/drive/drivef'
import {
  DriveChildrenItemFile,
  DriveDetails,
  DriveDetailsWithHierarchy,
  DriveItemDetails,
  Hierarchy,
  isNotInvalidId,
} from '../../../icloud/drive/types'
import { err } from '../../../lib/errors'
import { logger, logReturn, logReturnAs } from '../../../lib/logging'
import { Path } from '../../../lib/util'

const log = <T>(msg: string) => logReturn<T>(() => logger.debug(msg))
const ado = sequenceS(SRTE.Apply)

export function ls(path: string): DF.DriveM<DriveChildrenItemFile | DriveDetails> {
  //

  /*
  1. verify it's still a folder
  2.
  */
  const onFoundInCacheFolderLike = (item: CacheEntityFolderLike): DF.DriveM<DriveDetails> => {
    return pipe(
      DF.readEnv,
      log('found folder in cache'),
      SRTE.bind(
        'details',
        ({ api }) =>
          SRTE.fromTaskEither(
            api.retrieveItemDetailsInFolderHierarchyE(item.content.drivewsid),
          ),
      ),
      SRTE.bind('hierarchy', ({ details, cache }) =>
        SRTE.fromEither(pipe(
          E.Do,
          E.bind('cachedHierarchy', () => cache.getCachedHierarchyById(item.content.drivewsid)),
          E.map(({ cachedHierarchy }) =>
            compareItemWithHierarchy({ ...item.content, hierarchy: cachedHierarchy }, details)
          ),
        ))),
      SRTE.chain(({ hierarchy, details, cache }) =>
        hierarchy.newPath == hierarchy.oldPath
          ? pipe(
            DF.putDetailss([details]),
            log('path is same'),
            SRTE.map(() => details),
          )
          : pipe(
            () => DF.getFolderByPath(path),
            log(`path has been changed: ${hierarchy.oldPath} -> ${hierarchy.newPath}`),
            DF.withEmptyCache(Cache.semigroup),
          )
      ),
    )
  }

  const res = pipe(
    DF.readEnv,
    SRTE.bind('vpath', ({ cache }) => SRTE.fromEither(cache.getByPathV(path))),
    SRTE.chain(({ vpath }) =>
      pipe(
        vpath.valid
          ? isFolderLikeCacheEntity(vpath.last)
            ? onFoundInCacheFolderLike(vpath.last)
            : onFoundInCacheFile(path)(vpath.last)
          : onNotFoundInCache(path)(vpath.validPart, vpath.rest),
      )
    ),
    // SRTE.chainW(() => DF.readEnv),
    // SRTE.chain(({ cache }) => SRTE.fromEither(cache.getByPathE(path))),
    // SRTE.map(_ => _.content),
  )

  return res
}

const onNotFoundInCache = (path: string) =>
  (
    validPart: NA.NonEmptyArray<ICloudDriveCacheEntity>,
    rest: NA.NonEmptyArray<string>,
  ) => {
    logger.debug(`onNotFoundInCache: validPart: ${validPart.map(_ => _.content.drivewsid)}, rest: ${rest}`)

    const onHierarchiesSame = (
      lastItem: DriveDetailsWithHierarchy,
      rest: NA.NonEmptyArray<string>,
    ): DF.DriveM<DriveChildrenItemFile | DriveDetails> => {
      logger.debug('onHierarchiesSame')

      return pipe(
        () => DF.getItemByPathRelativeG(rest, lastItem),
        DF.withEmptyCache(Cache.semigroup),
        SRTE.chain(DF.ensureDetails),
        SRTE.chainFirstW(() =>
          pipe(
            DF.readEnv,
            SRTE.map(({ cache }) =>
              pipe(
                cache.getById('FILE::com.apple.CloudDocs::618D86E3-9662-424A-8F10-5B1213D40B67'),
                logReturnAs('cached'),
              )
            ),
          )
        ),
      )
    }

    const onHierarchiesDifferent = (
      cached: Hierarchy,
      actual: Hierarchy,
    ): DF.DriveM<DriveChildrenItemFile | DriveDetails> => {
      logger.debug('onHierarchiesDifferent')

      return pipe(
        () => DF.getFileOrFolderByPath(path),
        DF.withEmptyCache(Cache.semigroup),
      )
    }

    return pipe(
      DF.readEnv,
      SRTE.chain(({ cache, api }): DF.DriveM<DriveChildrenItemFile | DriveDetails> =>
        pipe(
          ado({
            cachedHierarchy: SRTE.of(
              C.entitiesToHierarchy(validPart),
            ),
            lastItem: SRTE.fromTaskEither<Error, DriveDetailsWithHierarchy, Cache, DriveApi>(
              pipe(
                api.retrieveItemDetailsInFolderHierarchyO(
                  NA.last(validPart).content.drivewsid,
                ),
                TE.filterOrElse(O.isSome, () => err(`missing drivewsid`)),
                TE.map(_ => _.value),
              ),
            ),
          }),
          SRTE.chain(({ cachedHierarchy, lastItem }) =>
            pipe(
              DF.putDetailss([lastItem]),
              SRTE.map(() => ({ cachedHierarchy, lastItem })),
            )
          ),
          SRTE.chain(({ cachedHierarchy, lastItem }) =>
            pipe(
              !compareHierarchiesItem(cachedHierarchy, lastItem).pathByIds
                ? onHierarchiesSame(lastItem, rest)
                : onHierarchiesDifferent(cachedHierarchy, lastItem.hierarchy),
            )
          ),
        )
      ),
    )
  }

const onFilePathChanged = (oldpath: string) =>
  (): DF.DriveM<DriveDetails | DriveChildrenItemFile> =>
    pipe(
      DF.readEnv,
      log('onFilePathChanged'),
      SRTE.chain(() =>
        pipe(
          () => DF.getItemByPath(oldpath),
          DF.withEmptyCache(Cache),
        )
      ),
      SRTE.chain(DF.ensureDetails),
    )

const getCachedItem = (path: string) => {
  return pipe(
    DF.readEnv,
    SRTE.bind('item', ({ cache }) => SRTE.fromEither(cache.getByPathE(path))),
    SRTE.bind('hierarchy', ({ cache, item }) => SRTE.fromEither(cache.getCachedHierarchyById(item.content.drivewsid))),
    SRTE.map(({ item, hierarchy }) => ({ ...item.content, hierarchy })),
  )
}

/* const onFilePathChangedV = (oldpath: string) =>
  (): DF.DriveM<DriveDetails | DriveChildrenItemFile> => {
    const parentDir = Path.dirname(oldpath)

    pipe(
      DF.readEnv,
      SRTE.bind('cachedParent', () => getCachedItem(parentDir)),
      SRTE.bind('actualParent', ({ api, cachedParent }) =>
        SRTE.fromTaskEither(
          api.retrieveItemDetailsInFolderHierarchyE(cachedParent.drivewsid),
        )),
      SRTE.map(({ actualParent, cachedParent }) => compareItemWithHierarchy(cachedParent, actualParent)),
    )

    return pipe(
      DF.readEnv,
      log('onFilePathChangedV'),
      SRTE.chain(({ cache }) => pipe(cache.getByPathE(oldpath))),
      SRTE.chain(() =>
        pipe(
          () => DF.getItemByPath(parentDir),
          DF.withEmptyCache(Cache),
        )
      ),
      SRTE.chain(DF.ensureDetails),
    )
  } */

const onFilePathSame = (
  item: DriveItemDetails,
): DF.DriveM<DriveDetails | DriveChildrenItemFile> =>
  pipe(
    // DF.readEnv,
    DF.putItems([item]),
    log('onFilePathSame'),
    SRTE.map(() => item),
    SRTE.chain(DF.ensureDetails),
  )

const onFoundInCacheFile = (path: string) =>
  (entity: CacheEntityFile): DF.DriveM<DriveDetails | DriveChildrenItemFile> => {
    logger.debug('onFoundInCacheFile')

    const res = pipe(
      DF.readEnv,
      SRTE.bind(
        'details',
        ({ api }) => SRTE.fromTaskEither(api.retrieveItemDetailsE(entity.content.drivewsid)),
      ),
      SRTE.bind('hierarchy', ({ details, cache }) =>
        SRTE.fromEither(pipe(
          E.Do,
          E.bind('cachedHierarchy', () => cache.getCachedHierarchyById(entity.content.drivewsid)),
          E.map(({ cachedHierarchy }) =>
            compareItemWithHierarchy(
              { ...entity.content, hierarchy: cachedHierarchy },
              details,
            )
          ),
        ))),
      SRTE.chain(({ hierarchy, details, cache }) =>
        hierarchy.newPath == hierarchy.oldPath
          ? pipe(
            onFilePathSame(details),
          )
          : pipe(
            // SRTE.of(constVoid),
            // log(`path updated: ${hierarchy.oldPath} -> ${hierarchy.newPath}`),
            onFilePathChanged(path)(),
          )
      ),
    )

    return res
  }
