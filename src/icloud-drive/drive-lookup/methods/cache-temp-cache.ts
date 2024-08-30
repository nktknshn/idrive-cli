import { constVoid, pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import { loggerIO } from '../../../logging/loggerIO'
import { err } from '../../../util/errors'
import { NEA } from '../../../util/types'
import { sequenceNArrayO } from '../../../util/util'
import { Cache, Types } from '../..'
import { chainState, get, Lookup, map, TempLookupCacheState } from '../drive-lookup'
import { putCache, usingCache } from './cache-methods'
import { retrieveItemDetailsInFoldersCached } from './cache-retrieveItemDetailsInFolders'

const setActive = <S extends TempLookupCacheState>(s: S): S => ({
  ...s,
  tempCache: O.some(Cache.cachef()),
})

const setInactive = <S extends TempLookupCacheState>(s: S): S => ({
  ...s,
  tempCache: O.none,
})

/**
 * Execute effect with empty temp cache. Afterwards add resulting temp cache to the main cache
 */
export const usingTempCache = <A>(ma: Lookup<A>): Lookup<A> =>
  chainState((prevstate) =>
    pipe(
      prevstate.tempCache,
      O.match(
        () =>
          pipe(
            SRTE.modify(setActive),
            SRTE.chain(() => ma),
            SRTE.bindTo('res'),
            SRTE.bindW('newstate', get),
            SRTE.chain(({ res, newstate }) =>
              pipe(
                O.isSome(newstate.tempCache)
                  ? pipe(
                    putCache(Cache.concat(prevstate.cache, newstate.tempCache.value)),
                    SRTE.chain(() => SRTE.modify(setInactive)),
                  )
                  : SRTE.of(constVoid()),
                SRTE.map(() => res),
              )
            ),
          ),
        () => ma,
      ),
    )
  )

/**
 * If temp cache is set it sources retrieveItemDetailsInFolders requests. Missed items will be saved there
 */
export function retrieveItemDetailsInFoldersTempCached<R extends Types.Root>(
  drivewsids: [R['drivewsid'], ...Types.NonRootDrivewsid[]],
): Lookup<[O.Some<R>, ...O.Option<Types.NonRootDetails>[]]>
export function retrieveItemDetailsInFoldersTempCached(
  drivewsids: NEA<string>,
): Lookup<NEA<O.Option<Types.Details>>>
export function retrieveItemDetailsInFoldersTempCached(
  drivewsids: NEA<string>,
): Lookup<NEA<O.Option<Types.Details>>> {
  return chainState(prevstate =>
    pipe(
      loggerIO.debug(
        `retrieveItemDetailsInFoldersTempCached: ${Cache.getAllDetails(prevstate.cache).map(_ => _.drivewsid)}`,
      ),
      SRTE.fromIO,
      SRTE.chain(() => retrieveItemDetailsInFoldersCached(drivewsids)),
      usingCache(pipe(
        prevstate.tempCache,
        O.getOrElse(Cache.cachef),
      )),
      SRTE.bindTo('res'),
      SRTE.bindW('newstate', get),
      SRTE.chain(({ newstate, res }) =>
        pipe(
          prevstate.tempCache,
          O.fold(
            () => putCache(Cache.concat(prevstate.cache, newstate.cache)),
            (tc) =>
              SRTE.put({
                ...newstate,
                cache: prevstate.cache,
                tempCache: O.some(Cache.concat(tc, newstate.cache)),
              }),
          ),
          map(() => res),
        )
      ),
    )
  )
}

export function retrieveItemDetailsInFoldersTempCachedStrict(
  drivewsids: NEA<string>,
): Lookup<NEA<Types.NonRootDetails>>
export function retrieveItemDetailsInFoldersTempCachedStrict(
  drivewsids: NEA<string>,
): Lookup<NEA<Types.Details>> {
  return pipe(
    retrieveItemDetailsInFoldersTempCached(drivewsids),
    SRTE.chain(res =>
      pipe(
        SRTE.fromOption(
          () => err(`some of the ids was not found`),
        )(sequenceNArrayO(res)),
      )
    ),
  )
}
