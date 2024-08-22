/* eslint-disable id-length */
import { constVoid, flow, identity, pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import { loggerIO } from '../../../logging/loggerIO'
import { err } from '../../../util/errors'
import { NEA } from '../../../util/types'
import { sequenceArrayO } from '../../../util/util'
import { Cache, Types } from '../..'
import { chainState, get, map, Monad, of, TempLookupCacheState } from '../drive-lookup'
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

// export const usingTempCache2 = <A>(ma: Effect<A>): Effect<A> =>
//   pipe(
//     get(),
//     SRTE.bindTo('prevstate'),
//     SRTE.chain(({ prevstate }) =>
//       pipe(
//         SRTE.fromOption(prevstate.tempCache),
//       )
//     ),
//     SRTE.bindW('newstate', get),
//     SRTE.chain(({ prevstate, newstate }) => pipe()),
//     // SRTE.bind('tempCache' , ()),
//   )
/**
 * execute effect with empty temp cache
 * afterwise add resulting temp cache to the main cache
 */
export const usingTempCache = <A>(ma: Monad<A>): Monad<A> =>
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
                    putCache(
                      Cache.concat(
                        prevstate.cache,
                        newstate.tempCache.value,
                      ),
                    ),
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
 * if temp cache is set
 * it sources retrieveItemDetailsInFolders requests
 * missed items will be saved there
 */
export function retrieveItemDetailsInFoldersTempCached<R extends Types.Root>(
  drivewsids: [R['drivewsid'], ...Types.NonRootDrivewsid[]],
): Monad<[O.Some<R>, ...O.Option<Types.NonRootDetails>[]]>
export function retrieveItemDetailsInFoldersTempCached(
  drivewsids: NEA<string>,
): Monad<NEA<O.Option<Types.Details>>>
export function retrieveItemDetailsInFoldersTempCached(
  drivewsids: NEA<string>,
): Monad<NEA<O.Option<Types.Details>>> {
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

// eslint-disable-next-line id-length
export function retrieveItemDetailsInFoldersTempCachedStrict(
  drivewsids: NEA<string>,
): Monad<NEA<Types.NonRootDetails>>
export function retrieveItemDetailsInFoldersTempCachedStrict(
  drivewsids: NEA<string>,
): Monad<NEA<Types.Details>> {
  return pipe(
    retrieveItemDetailsInFoldersTempCached(drivewsids),
    SRTE.chain(res =>
      pipe(
        SRTE.fromOption(
          () => err(`some of the ids was not found`),
        )(sequenceArrayO(res)),
      )
    ),
  )
}
