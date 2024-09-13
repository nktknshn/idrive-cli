import * as A from 'fp-ts/Array'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'

import { loggerIO } from '../../../logging/loggerIO'
import { guardSnd } from '../../../util/guards'
import { NEA } from '../../../util/types'
import { sequenceNArrayO } from '../../../util/util'
import { Cache, Types } from '../..'
import { chainState, chainStateAndDeps, getState, Lookup, map, State, TempLookupCacheState } from '../drive-lookup'
import { NotFoundError } from '../errors'
import { usingCache } from './cache-methods'
import { retrieveItemDetailsInFoldersCached } from './cache-retrieve-details'

export const setTempCacheActive = <S extends TempLookupCacheState>(s: S): S => ({
  ...s,
  tempCache: O.some(Cache.cache()),
  tempCacheMissingDetails: [],
})

export const setTempCacheInactive = <S extends TempLookupCacheState>(s: S): S => ({
  ...s,
  tempCache: O.none,
  tempCacheMissingDetails: [],
})

export const clearTempCache = <S extends TempLookupCacheState>(s: S): S => ({
  ...s,
  // clear the temp cache if it is active
  tempCache: pipe(s.tempCache, O.map(Cache.cache)),
  tempCacheMissingDetails: [],
})

export const mergeTempCache = <S extends State>(state: S): S =>
  pipe({
    ...state,
    cache: pipe(
      state.tempCache,
      O.getOrElse(() => Cache.cache()),
      Cache.concat(state.cache),
      Cache.removeByIds(state.tempCacheMissingDetails),
    ),
  }, clearTempCache)

/**
 * Execute effect enabling temporary cache. Saves some calls to the api when chaining `retrieveItemDetailsInFoldersTempCachedStrict`. Creates a separate cache for those calls which is considered fresh and does not need to be verified.
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
            SRTE.modify(setTempCacheActive),
            // execute the effect
            SRTE.chain(() => ma),
            SRTE.chainFirst(() => SRTE.modify(mergeTempCache)),
            SRTE.chainFirst(() => SRTE.modify(setTempCacheInactive)),
          ),
        // otherwise do nothing, the state will be merged and temp cache
        // deactivated by the initial `usingTempCache` call
        () => ma,
      ),
    )
  )

const getMissingDetails = (
  drivewsids: NEA<string>,
  result: NEA<O.Option<Types.Details>>,
): string[] => pipe(NA.zip(drivewsids, result), A.filter(guardSnd(O.isNone)), A.map(_ => _[0]))

/**
 * Wraps `retrieveItemDetailsInFoldersCached` to rely on the temporary cache instead of the main one. If the temporary cache is empty or inactive, the method will retrieve all the requested details from the api. Useful when chaining multiple `retrieveItemDetailsInFoldersCached` for overlaping paths because it saves api calls. If `apiUsage` is set to 'onlycache' or 'fallback', the main cache will be used as fresh cache.
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
  return chainStateAndDeps(({ deps: { apiUsage }, state: prevstate }) =>
    pipe(
      loggerIO.debug(
        `retrieveItemDetailsInFoldersTempCached. `
          + `Main cache: ${Cache.keysCount(prevstate.cache)} items. `
          + `Temp cache: ${
            prevstate.tempCache._tag === 'None'
              ? 'inactive'
              : Cache.keysCount(prevstate.tempCache.value).toString() + ' items'
          }`,
      ),
      SRTE.fromIO,
      SRTE.chain(
        () =>
          pipe(
            retrieveItemDetailsInFoldersCached(drivewsids),
            usingCache(
              apiUsage === 'onlycache' || apiUsage === 'fallback'
                ? prevstate.cache
                : pipe(
                  // use existing temp cache if present
                  prevstate.tempCache,
                  // or run with empty cache
                  O.getOrElse(Cache.cache),
                ),
            ),
          ),
      ),
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
                // collect the missing drivewsids
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
    SRTE.chain(res =>
      SRTE.fromOption(() =>
        NotFoundError.createTemplate({
          item: drivewsids.join(', '),
          container: 'icloud',
          prefix: 'retrieveItemDetailsInFoldersTempCachedStrict',
        })
      )(sequenceNArrayO(res))
    ),
  )
}
