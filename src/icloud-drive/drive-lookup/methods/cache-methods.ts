import { constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as T from '../../icloud-drive-items-types'
import { chain, Effect, map, State, state } from '..'
import * as C from '../cache'

export const putCache = (cache: C.Cache): Effect<void> =>
  pipe(
    state(),
    SRTE.chain(
      (state: State) => SRTE.put({ ...state, cache }),
    ),
  )

export const putDetailss = (detailss: T.Details[]): Effect<void> =>
  chainCache(
    flow(
      C.putDetailss(detailss),
      SRTE.fromEither,
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

export const modifyCache = (f: (cache: C.Cache) => C.Cache): Effect<void> =>
  chainCache(flow(f, putCache, map(constVoid)))

export const asksCache = <A>(f: (cache: C.Cache) => A): Effect<A> => pipe(state(), map(({ cache }) => f(cache)))

export const askCache = (): Effect<C.Cache> => pipe(state(), map(({ cache }) => cache))

export const chainCache = <A>(f: (cache: C.Cache) => Effect<A>): Effect<A> =>
  pipe(state(), chain(({ cache }) => f(cache)))

// export const withCache = (newCache: C.Cache) =>
//   <A>(ma: Effect<A>): Effect<A> =>
//     pipe(
//       askCache(),
//       SRTE.chain((oldcache) =>
//         pipe(
//           putCache(newCache),
//           SRTE.chain(() => ma),
//           SRTE.chain((res) =>
//             chainCache(curcache =>
//               pipe(
//                 putCache(oldcache),
//                 SRTE.chain(() => putDetailss(C.getAllDetails(curcache))),
//                 SRTE.map(() => res),
//               )
//             )
//           ),
//         )
//       ),
//     )
