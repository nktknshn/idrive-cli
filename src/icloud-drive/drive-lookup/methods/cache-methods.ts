import { constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import * as T from '../../drive-types'
import { chain, get, LookupState, map, Monad } from '..'
import * as C from '../cache'

export const putCache = (cache: C.LookupCache): Monad<void> =>
  pipe(
    get(),
    SRTE.chain(
      (state: LookupState) => SRTE.put({ ...state, cache }),
    ),
  )

export const putDetailss = (detailss: T.Details[]): Monad<void> =>
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
}): Monad<void> =>
  pipe(
    putDetailss(found),
    chain(() => removeByIdsFromCache(missed)),
  )

export const removeByIdsFromCache = (
  drivewsids: string[],
): Monad<void> => modifyCache(C.removeByIds(drivewsids))

export const modifyCache = (f: (cache: C.LookupCache) => C.LookupCache): Monad<void> =>
  chainCache(flow(f, putCache, map(constVoid)))

export const askCache = (): Monad<C.LookupCache> =>
  pipe(
    get(),
    map(({ cache, tempCache }) =>
      pipe(
        C.concat(cache, pipe(tempCache, O.getOrElse(() => C.cachef()))),
      )
    ),
  )

export const asksCache = <A>(f: (cache: C.LookupCache) => A): Monad<A> => pipe(askCache(), map(f))

export const chainCache = <A>(f: (cache: C.LookupCache) => Monad<A>): Monad<A> =>
  pipe(get(), chain(({ cache }) => f(cache)))

export const usingCache = (cache: C.LookupCache) =>
  <A>(ma: Monad<A>): Monad<A> =>
    pipe(
      putCache(cache),
      SRTE.chain(() => pipe(ma)),
    )
