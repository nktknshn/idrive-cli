import { constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import * as T from '../../drive-types'
import { chain, Deps, getState, Lookup, map, State } from '..'
import * as C from '../cache'

export const putCacheWithHook = (cache: C.LookupCache): Lookup<void> =>
  pipe(
    putCache(cache),
    SRTE.chain(() => SRTE.asks((d: Deps) => d.hookPutCache)),
    SRTE.chain(h => h ?? SRTE.of(constVoid())),
    SRTE.map(constVoid),
  )

export const putCache = (cache: C.LookupCache): Lookup<void> =>
  pipe(
    getState(),
    SRTE.chain((state: State) => SRTE.put({ ...state, cache })),
  )

export const putDetailss = (detailss: T.Details[]): Lookup<void> =>
  chainCache(
    flow(
      C.putDetailss(detailss),
      SRTE.of,
      SRTE.chain(putCache),
    ),
  )

export const modifyCache = (f: (cache: C.LookupCache) => C.LookupCache): Lookup<void> =>
  chainCache(flow(f, putCache, map(constVoid)))

export const getCache = (): Lookup<C.LookupCache> =>
  pipe(
    getState(),
    map(({ cache, tempCache }) =>
      pipe(
        C.concat(cache, pipe(tempCache, O.getOrElse(() => C.cachef()))),
      )
    ),
  )

export const getsCache = <A>(f: (cache: C.LookupCache) => A): Lookup<A> => pipe(getCache(), map(f))

export const chainCache = <A>(f: (cache: C.LookupCache) => Lookup<A>): Lookup<A> =>
  pipe(getState(), chain(({ cache }) => f(cache)))

/** Execute the effect with the given cache */
export const usingCache = (cache: C.LookupCache) =>
  <A>(ma: Lookup<A>): Lookup<A> =>
    pipe(
      putCache(cache),
      SRTE.chain(() => pipe(ma)),
    )

/** Save existing folders details and remove the ones that were not found */
export const putMissedFound = ({ found, missed }: {
  found: T.Details[]
  missed: string[]
}): Lookup<void> =>
  pipe(
    putDetailss(found),
    chain(() => removeByIdsFromCache(missed)),
  )

export const removeByIdsFromCache = (
  drivewsids: string[],
): Lookup<void> => modifyCache(C.removeByIds(drivewsids))
