import * as A from 'fp-ts/Array'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'

import { loggerIO } from '../../../logging/loggerIO'
import { err } from '../../../util/errors'
import { guardSnd } from '../../../util/guards'
import { NEA } from '../../../util/types'
import { sequenceNArrayO } from '../../../util/util'
import { Cache, Types } from '../..'
import { chainState, getState, Lookup, map, TempLookupCacheState } from '../drive-lookup'
import { putCache, usingCache } from './cache-methods'
import { retrieveItemDetailsInFoldersCached } from './cache-retrieve-details'

const setActive = <S extends TempLookupCacheState>(s: S): S => ({
  ...s,
  tempCache: O.some(Cache.cachef()),
  tempCacheMissingDetails: [],
})

const setInactive = <S extends TempLookupCacheState>(s: S): S => ({
  ...s,
  tempCache: O.none,
  tempCacheMissingDetails: [],
})

/**
 * Execute effect enabling temporary cache.
 */
export const usingTempCache = <A>(ma: Lookup<A>): Lookup<A> =>
  chainState((prevstate) =>
    pipe(
      prevstate.tempCache,
      O.match(
        // if the temp cache is not active
        () =>
          pipe(
            // activate it
            SRTE.modify(setActive),
            // execute the effect
            SRTE.chain(() => ma),
            SRTE.bindTo('res'),
            SRTE.bindW('newstate', getState),
            SRTE.chain(({ res, newstate }) =>
              // after execution
              pipe(
                newstate.tempCache,
                O.getOrElse(() => Cache.cachef()),
                // merge the temporary cache into the main cache
                Cache.concat(prevstate.cache),
                Cache.removeByIds(prevstate.tempCacheMissingDetails),
                putCache,
                // deactivate the temporary cache
                SRTE.chain(() => SRTE.modify(setInactive)),
                SRTE.map(() => res),
              )
            ),
          ),
        // otherwise do nothing
        () => ma,
      ),
    )
  )

const getMissingDetails = (
  drivewsids: NEA<string>,
  result: NEA<O.Option<Types.Details>>,
): string[] =>
  pipe(
    NA.zip(drivewsids, result),
    A.filter(guardSnd(O.isNone)),
    A.map(_ => _[0]),
  )

/**
 * Wraps `retrieveItemDetailsInFoldersCached` to use the temporary cache instead of the main. This method ignores the main cache as a source of details. If the the temporary cache is empty or inactive, the method will retrieve all the requested details from the api.
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
        `retrieveItemDetailsInFoldersTempCached. Main cache: ${Cache.keysString(prevstate.cache)}, temp cache: ${
          prevstate.tempCache._tag === 'None' ? 'empty' : Cache.keysString(prevstate.tempCache.value)
        }`,
      ),
      SRTE.fromIO,
      SRTE.chain(() => retrieveItemDetailsInFoldersCached(drivewsids)),
      usingCache(pipe(
        // use existing temp cache if present
        prevstate.tempCache,
        // or run with empty cache
        O.getOrElse(Cache.cachef),
      )),
      SRTE.bindTo('res'),
      SRTE.bindW('newstate', getState),
      SRTE.chainW(({ newstate, res }) =>
        pipe(
          prevstate.tempCache,
          O.fold(
            // if tempcache is set to be inactive, update the main cache
            () =>
              SRTE.put({
                ...newstate,
                cache: pipe(
                  Cache.concat(prevstate.cache, newstate.cache),
                  Cache.removeByIds(getMissingDetails(drivewsids, res)),
                ),
              }),
            (prevTempCache) =>
              // if tempcache is set to be active, update the temporary cache
              SRTE.put({
                ...newstate,
                // keep the old main cache
                cache: prevstate.cache,
                tempCache: O.some(Cache.concat(prevTempCache, newstate.cache)),
                tempCacheMissingDetails: [
                  ...prevstate.tempCacheMissingDetails,
                  ...getMissingDetails(drivewsids, res),
                ],
              }),
          ),
          map(() => res),
        )
      ),
    )
  )
}

/** Fails if some of the ids were not found */
export function retrieveItemDetailsInFoldersTempCachedStrict(
  drivewsids: NEA<string>,
): Lookup<NEA<Types.NonRootDetails>>
export function retrieveItemDetailsInFoldersTempCachedStrict(
  drivewsids: NEA<string>,
): Lookup<NEA<Types.Details>> {
  return pipe(
    retrieveItemDetailsInFoldersTempCached(drivewsids),
    SRTE.chain(res => SRTE.fromOption(() => err(`some of the ids was not found`))(sequenceNArrayO(res))),
  )
}
