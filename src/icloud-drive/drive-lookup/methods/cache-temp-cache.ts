/* eslint-disable id-length */
import { constVoid, flow, identity, pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import { err } from '../../../util/errors'
import { NEA } from '../../../util/types'
import { C, T } from '../..'
import { chain, chainState, Effect, map, of, State, state, TempCacheState } from '../drive-lookup'
import { putDetailss } from './cache-methods'
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
    state(),
    SRTE.chain((prevstate) =>
      pipe(
        prevstate.tempCache,
        O.match(
          () =>
            pipe(
              SRTE.modify(setActive),
              SRTE.chain(() => ma),
              SRTE.bindTo('res'),
              SRTE.bindW('newstate', state),
              SRTE.chain(({ res, newstate }) =>
                pipe(
                  SRTE.put(setInactive(newstate)),
                  SRTE.chain(() =>
                    O.isSome(newstate.tempCache)
                      ? putDetailss(
                        C.getAllDetails(
                          newstate.tempCache.value,
                        ),
                      )
                      : SRTE.of(constVoid())
                  ),
                  SRTE.map(() => res),
                )
              ),
            ),
          () => ma,
        ),
      )
    ),
  )

/*
  const usingTempCacheAsCache = <A>(ma: Effect<A>): Effect<A> =>
  pipe(
    chainState(prevstate =>
      pipe(
        SRTE.put({
          ...prevstate,
          cache: prevstate.tempCache,
        }),
        SRTE.chain(() => pipe(ma)),
        SRTE.chainW((res) =>
          pipe(
            chainState(s =>
              pipe(
                SRTE.put({
                  ...s,
                  tempCache: s.cache,
                  cache: prevstate.cache,
                }),
                SRTE.chain(
                  () =>
                    putDetailss(
                      C.getAllDetails(s.cache),
                    ),
                ),
              )
            ),
            SRTE.map(() => res),
          )
        ),
      )
    ),
  )
  */

/* const usingCache = (cache: C.Cache) =>
  <A>(ma: Effect<A>): Effect<A> =>
    pipe(
      chainState(prevstate =>
        pipe(
          SRTE.put({ ...prevstate, cache }),
          SRTE.chain(() => pipe(ma)),
          SRTE.chainW((res) =>
            pipe(
              chainState(newstate =>
                pipe(
                  SRTE.put({ ...newstate, cache: prevstate.cache }),
                  SRTE.chain(
                    () =>
                      putDetailss(
                        C.getAllDetails(newstate.cache),
                      ),
                  ),
                )
              ),
              SRTE.map(() => res),
            )
          ),
        )
      ),
    )
 */
export const usingCache = (cache: C.Cache) =>
  <A>(ma: Effect<A>): Effect<A> =>
    pipe(
      chainState(prevstate =>
        pipe(
          SRTE.put({ ...prevstate, cache }),
          SRTE.chain(() => pipe(ma)),
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
      of(pipe(
        prevstate.tempCache,
        O.fold(() => C.cachef(), identity),
      )),
      SRTE.bindTo('tempCache'),
      SRTE.bind('res', ({ tempCache }) =>
        pipe(
          retrieveItemDetailsInFoldersCached(drivewsids),
          usingCache(tempCache),
        )),
      SRTE.bindW('newstate', state),
      SRTE.chainW(({ newstate, res, tempCache }) =>
        pipe(
          tempCache,
          C.putDetailss(C.getAllDetails(newstate.cache)),
          SRTE.fromEither,
          SRTE.chain(c =>
            SRTE.put({
              ...newstate,
              cache: prevstate.cache,
              tempCache: O.some(c),
            })
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
