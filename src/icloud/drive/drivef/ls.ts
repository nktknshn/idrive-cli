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

const log = <T>(msg: string) => logReturn<T>(() => logger.debug(msg))
const ado = sequenceS(SRTE.Apply)

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

export const ls = (path: string): DF.DriveM<DriveChildrenItemFile | DriveDetails> => {
  const onPathChanged = (): DF.DriveM<DriveDetails | DriveChildrenItemFile> =>
    pipe(
      DF.readEnv,
      log('onPathChanged'),
      SRTE.chain(() =>
        pipe(
          () => DF.getItemByPath(path),
          DF.withEmptyCache(Cache),
        )
      ),
      SRTE.chain(DF.ensureDetails),
    )

  const onPathSame = (
    item: DriveItemDetails,
  ): DF.DriveM<DriveDetails | DriveChildrenItemFile> =>
    pipe(
      // DF.readEnv,
      DF.putItems([item]),
      log('onPathSame'),
      SRTE.map(() => item),
      SRTE.chain(DF.ensureDetails),
    )

  const onFoundInCacheFile = (item: CacheEntityFile): DF.DriveM<DriveDetails | DriveChildrenItemFile> => {
    logger.debug('onFoundInCacheFile')
    const res = pipe(
      DF.readEnv,
      SRTE.bind(
        'details',
        ({ api }) => SRTE.fromTaskEither(api.retrieveItemsDetails([item.content.drivewsid])),
      ),
      SRTE.bind('hierarchy', ({ details, cache }) =>
        SRTE.fromEither(pipe(
          E.Do,
          E.bind('cachedHierarchy', () => cache.getCachedHierarchyById(item.content.drivewsid)),
          E.map(({ cachedHierarchy }) =>
            compareItemWithHierarchy(
              { ...item.content, hierarchy: cachedHierarchy },
              details.items[0],
            )
          ),
        ))),
      SRTE.chain(({ hierarchy, details, cache }) =>
        hierarchy.newPath == hierarchy.oldPath
          ? pipe(
            onPathSame(details.items[0]),
          )
          : pipe(
            // SRTE.of(constVoid),
            // log(`path updated: ${hierarchy.oldPath} -> ${hierarchy.newPath}`),
            onPathChanged(),
          )
      ),
    )

    return res
  }

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
            : onFoundInCacheFile(vpath.last)
          : onNotFoundInCache(path)(vpath.validPart, vpath.rest),
      )
    ),
    // SRTE.chainW(() => DF.readEnv),
    // SRTE.chain(({ cache }) => SRTE.fromEither(cache.getByPathE(path))),
    // SRTE.map(_ => _.content),
  )

  return res
}
