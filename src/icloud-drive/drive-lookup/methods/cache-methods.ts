import { constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import * as T from '../../icloud-drive-items-types'
import { chain, Effect, get, LookupState, map } from '..'
import * as C from '../cache'

export const putCache = (cache: C.LookupCache): Effect<void> =>
  pipe(
    get(),
    SRTE.chain(
      (state: LookupState) => SRTE.put({ ...state, cache }),
    ),
  )

export const putDetailss = (detailss: T.Details[]): Effect<void> =>
  chainCache(
    flow(
      C.putDetailss(detailss),
      SRTE.of,
      SRTE.chain(putCache),
    ),
  )

export const putMissedFound = ({ found, missed }: {
  found: T.Details[]
  missed: string[]
}): Effect<void> =>
  pipe(
    putDetailss(found),
    chain(() => removeByIdsFromCache(missed)),
  )

export const removeByIdsFromCache = (
  drivewsids: string[],
): Effect<void> => modifyCache(C.removeByIds(drivewsids))

export const modifyCache = (f: (cache: C.LookupCache) => C.LookupCache): Effect<void> =>
  chainCache(flow(f, putCache, map(constVoid)))

export const askCache = (): Effect<C.LookupCache> =>
  pipe(
    get(),
    map(({ cache, tempCache }) =>
      pipe(
        C.concat(cache, pipe(tempCache, O.getOrElse(() => C.cachef()))),
      )
    ),
  )

export const asksCache = <A>(f: (cache: C.LookupCache) => A): Effect<A> => pipe(askCache(), map(f))

export const chainCache = <A>(f: (cache: C.LookupCache) => Effect<A>): Effect<A> =>
  pipe(get(), chain(({ cache }) => f(cache)))

export const usingCache = (cache: C.LookupCache) =>
  <A>(ma: Effect<A>): Effect<A> =>
    pipe(
      putCache(cache),
      SRTE.chain(() => pipe(ma)),
    )
