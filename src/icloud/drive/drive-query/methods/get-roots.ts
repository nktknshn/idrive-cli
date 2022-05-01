import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as API from '../../drive-api'
import * as T from '../../icloud-drive-types'
import { rootDrivewsid, trashDrivewsid } from '../../icloud-drive-types/types-io'
import { chain, map, of } from '..'
import { Deps, Effect, State } from '..'
import * as C from '../cache'
import { CacheEntityFolderRootDetails, CacheEntityFolderTrashDetails } from '../cache/cache-types'
import { asksCache, chainCache, putMissedFound } from './cache-methods'
import { retrieveItemDetailsInFoldersSaving } from './cache-retrieveItemDetailsInFolders'

/** retrieve root from cache or from api if it's missing from cache and chain a computation*/

export const chainCachedDocwsRoot = <A>(
  f: (root: T.DetailsDocwsRoot) => Effect<A>,
): Effect<A> => {
  return pipe(
    retrieveItemDetailsInFoldersCached([rootDrivewsid]),
    chain(() => chainCache(cache => SRTE.fromEither(C.getDocwsRoot(cache)))),
    map(_ => _.content),
    chain(f),
  )
}

export const getCachedDocwsRoot = (): Effect<T.DetailsDocwsRoot, Deps> => chainCachedDocwsRoot(of)

export const getCachedRoot = (trash: boolean): Effect<T.Root> => {
  return pipe(
    retrieveItemDetailsInFoldersCached([rootDrivewsid, trashDrivewsid]),
    chain(() =>
      chainCache(cache =>
        SRTE.fromEither(pipe(
          (trash ? C.getTrash : C.getDocwsRoot)(cache),
          E.map((_: CacheEntityFolderTrashDetails | CacheEntityFolderRootDetails) => _.content),
        ))
      )
    ),
  )
}

export const chainCachedTrash = <A>(
  f: (root: T.DetailsTrashRoot) => Effect<A>,
): Effect<A> => {
  return pipe(
    retrieveItemDetailsInFoldersCached([trashDrivewsid]),
    chain(() => chainCache(SRTE.fromEitherK(C.getTrash))),
    map(_ => _.content),
    chain(f),
  )
}
// FIXME

export const getDocwsRoot = (): Effect<T.DetailsDocwsRoot, Deps> =>
  pipe(
    retrieveItemDetailsInFoldersSaving<T.DetailsDocwsRoot>([rootDrivewsid]),
    SRTE.map(_ => _[0].value),
  )

export const getTrash = (): Effect<T.DetailsTrashRoot, Deps> =>
  pipe(
    retrieveItemDetailsInFoldersSaving<T.DetailsTrashRoot>([trashDrivewsid]),
    SRTE.map(_ => _[0].value),
  )

/** returns details from cache if they are there otherwise fetches them from icloid api.   */
const retrieveItemDetailsInFoldersCached = (drivewsids: string[]): Effect<T.MaybeInvalidId<T.Details>[]> => {
  return pipe(
    chainCache(
      SRTE.fromEitherK(C.getFoldersDetailsByIdsSeparated(drivewsids)),
    ),
    SRTE.chain(({ missed }) =>
      pipe(
        missed,
        A.matchW(
          () => SRTE.of({ missed: [], found: [] }),
          (missed) => API.retrieveItemDetailsInFoldersSeparated<State>(missed),
        ),
      )
    ),
    SRTE.chain(putMissedFound),
    SRTE.chainW(() => asksCache(C.getFoldersDetailsByIds(drivewsids))),
    SRTE.chainW(e => SRTE.fromEither(e)),
  )
}
