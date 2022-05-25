/* eslint-disable id-length */
import { constVoid, flow, identity, pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import { err } from '../../../util/errors'
import { loggerIO } from '../../../util/loggerIO'
import { logger } from '../../../util/logging'
import { NEA } from '../../../util/types'
import { C, T } from '../..'
import { chain, chainState, Effect, get, map, of, State, TempCacheState } from '../drive-lookup'
import { putCache, putDetailss, usingCache } from './cache-methods'
import {
  retrieveItemDetailsInFoldersCached,
  retrieveItemDetailsInFoldersSaving,
} from './cache-retrieveItemDetailsInFolders'

const setActive = <S extends TempCacheState>(s: S): S => ({
  ...s,
  tempCache: O.some(C.cachef()),
})

const setInactive = <S extends TempCacheState>(s: S): S => ({
  ...s,
  tempCache: O.none,
})

/**
 * execute effect with empty temp cache
 * afterwise add resulting temp cache to the main cache
 */
export const usingTempCache = <A>(ma: Effect<A>): Effect<A> =>
  pipe(
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
                        C.concat(
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
    ),
  )

/**
 * if temp cache is set
 * it sources retrieveItemDetailsInFolders requests
 * missed items will be saved there
 */
export function retrieveItemDetailsInFoldersTempCached<R extends T.Root>(
  drivewsids: [R['drivewsid'], ...T.NonRootDrivewsid[]],
): Effect<[O.Some<R>, ...O.Option<T.NonRootDetails>[]]>
export function retrieveItemDetailsInFoldersTempCached(
  drivewsids: NEA<string>,
): Effect<NEA<O.Option<T.Details>>>
export function retrieveItemDetailsInFoldersTempCached(
  drivewsids: NEA<string>,
): Effect<NEA<O.Option<T.Details>>> {
  return chainState(prevstate =>
    pipe(
      loggerIO.debug(
        `retrieveItemDetailsInFoldersTempCached: ${C.getAllDetails(prevstate.cache).map(_ => _.drivewsid)}`,
      ),
      SRTE.fromIO,
      SRTE.chain(() => retrieveItemDetailsInFoldersCached(drivewsids)),
      usingCache(pipe(
        prevstate.tempCache,
        O.fold(() => C.cachef(), identity),
      )),
      SRTE.bindTo('res'),
      SRTE.bindW('newstate', get),
      SRTE.chain(({ newstate, res }) =>
        pipe(
          prevstate.tempCache,
          O.fold(
            () => putCache(C.concat(prevstate.cache, newstate.cache)),
            (tc) =>
              SRTE.put({
                ...newstate,
                cache: prevstate.cache,
                tempCache: O.some(C.concat(tc, newstate.cache)),
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
): Effect<NEA<T.NonRootDetails>>
export function retrieveItemDetailsInFoldersTempCachedStrict(
  drivewsids: NEA<string>,
): Effect<NEA<T.Details>> {
  return pipe(
    retrieveItemDetailsInFoldersTempCached(drivewsids),
    SRTE.chain(
      flow(
        O.sequenceArray,
        SRTE.fromOption(() => err(`some of the ids was not found`)),
        v => v as Effect<NEA<T.Details>>,
      ),
    ),
  )
}
