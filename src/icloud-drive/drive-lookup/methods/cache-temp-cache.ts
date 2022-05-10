/* eslint-disable id-length */
import { flow, pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import { err } from '../../../util/errors'
import { NEA } from '../../../util/types'
import { C, T } from '../..'
import { Effect, State, state, TempCacheState } from '../drive-lookup'
import { putDetailss, withCache } from './cache-methods'
import {
  retrieveItemDetailsInFoldersCached,
  retrieveItemDetailsInFoldersCachedStrict,
  retrieveItemDetailsInFoldersSaving,
  retrieveItemDetailsInFoldersSavingStrict,
} from './cache-retrieveItemDetailsInFolders'

const activateTempCache = <S extends TempCacheState>(s: S) => ({
  ...s,
  tempCacheActive: true,
  tempCache: C.cachef(),
})

const deactivateTempCache = <S extends TempCacheState>(s: S) => ({
  ...s,
  tempCacheActive: false,
  tempCache: C.cachef(),
})

export const usingTempCache = <A>(ma: Effect<A>): Effect<A> =>
  pipe(
    SRTE.modify((s: State) => activateTempCache(s)),
    SRTE.chainW(() => ma),
    SRTE.chain(res =>
      pipe(
        state(),
        SRTE.chain((s: State) =>
          pipe(
            SRTE.put(deactivateTempCache(s)),
            SRTE.chain(() => putDetailss(C.getAllDetails(s.tempCache))),
          )
        ),
        SRTE.map(() => res),
      )
    ),
  )

export function retrieveItemDetailsInFoldersTempCached<R extends T.Root>(
  drivewsids: [R['drivewsid'], ...T.NonRootDrivewsid[]],
): Effect<[O.Some<R>, ...O.Option<T.NonRootDetails>[]]>
export function retrieveItemDetailsInFoldersTempCached(
  drivewsids: NEA<string>,
): Effect<NEA<O.Option<T.Details>>>
export function retrieveItemDetailsInFoldersTempCached(
  drivewsids: NEA<string>,
): Effect<NEA<O.Option<T.Details>>> {
  return pipe(
    state(),
    SRTE.chainW(s =>
      s.tempCacheActive
        ? pipe(
          state(),
          SRTE.chain(prevstate =>
            pipe(
              SRTE.put({ ...prevstate, cache: prevstate.tempCache }),
              SRTE.chain(() =>
                pipe(
                  retrieveItemDetailsInFoldersCached(drivewsids),
                )
              ),
              SRTE.chainW((res) =>
                pipe(
                  state(),
                  SRTE.chain(s => SRTE.put({ ...s, tempCache: s.cache, cache: prevstate.cache })),
                  SRTE.map(() => res),
                )
              ),
            )
          ),
          // SRTE.modify(s => ({ ...s, tempCache })),
          // withCache(s.tempCache),
        )
        : retrieveItemDetailsInFoldersSaving(drivewsids)
    ),
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
