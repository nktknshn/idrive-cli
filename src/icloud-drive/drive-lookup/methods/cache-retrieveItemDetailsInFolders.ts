import * as A from 'fp-ts/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { Eq } from 'fp-ts/lib/string'
import * as O from 'fp-ts/Option'
import { err } from '../../../util/errors'
import { loggerIO } from '../../../util/loggerIO'
import { NEA } from '../../../util/types'
import { sequenceArrayE, sequenceArrayO } from '../../../util/util'
import { C, DriveApi, T } from '../..'
import { rootDrivewsid, trashDrivewsid } from '../../icloud-drive-items-types/types-io'
import { chain, Effect, of, State } from '..'
import { askCache, asksCache, chainCache, putMissedFound, usingCache } from './cache-methods'

/** returns details from cache if they are there otherwise fetches them from icloid api.   */
export const retrieveItemDetailsInFoldersCached = (
  drivewsids: NEA<string>,
): Effect<NEA<O.Option<T.Details>>> => {
  const uniqids = pipe(drivewsids, NA.uniq(Eq))

  return pipe(
    askCache(),
    SRTE.chain(
      c =>
        SRTE.fromIO(
          loggerIO.debug(`retrieveItemDetailsInFoldersCached: ${C.getAllDetails(c).map(_ => _.drivewsid)}`),
        ),
    ),
    SRTE.chain(() =>
      chainCache(
        SRTE.fromEitherK(C.getFoldersDetailsByIdsSeparated(uniqids)),
      )
    ),
    SRTE.chain(({ missed }) =>
      pipe(
        missed,
        A.matchW(
          () => SRTE.of({ missed: [], found: [] }),
          (missed) => DriveApi.retrieveItemDetailsInFoldersSeparated<State>(missed),
        ),
      )
    ),
    SRTE.chain(putMissedFound),
    SRTE.chainW(() => asksCache(C.getFoldersDetailsByIds(drivewsids))),
    SRTE.chainW(e => SRTE.fromEither(e)),
    SRTE.chain((details) => of(NA.map(T.invalidIdToOption)(details))),
  )
}

export function retrieveItemDetailsInFoldersCachedStrict(
  drivewsids: NEA<string>,
): Effect<NEA<T.NonRootDetails>>
export function retrieveItemDetailsInFoldersCachedStrict(
  drivewsids: NEA<string>,
): Effect<NEA<T.Details>> {
  return pipe(
    retrieveItemDetailsInFoldersCached(drivewsids),
    SRTE.chain(res =>
      SRTE.fromOption(() => err(`some of the ids was not found`))(
        sequenceArrayO(res),
      )
    ),
  )
}

// const retrieveItemDetailsInFoldersSaving=  flow(
//   retrieveItemDetailsInFoldersCached,
//   usingCache(C.cachef()),
// )

// type D = {
//   retrieveItemDetailsInFoldersTempCache<S>(
//     drivewsids: NEA<string>,
//   ): XXX<S, DriveApi.Dep<'retrieveItemDetailsInFolders'>, NEA<T.NonRootDetails>>
// }
// when no special context enabled it behaves just like retrieveItemDetailsInFoldersSaving
// but when inside the context it works like retrieveItemDetailsInFoldersCached
// but using the context cache

/** retrieves actual drivewsids saving valid ones to cache and removing those that were not found */
export function retrieveItemDetailsInFoldersSaving<R extends T.Root>(
  drivewsids: [R['drivewsid'], ...T.NonRootDrivewsid[]],
): Effect<[O.Some<R>, ...O.Option<T.NonRootDetails>[]]>
export function retrieveItemDetailsInFoldersSaving(
  drivewsids: [typeof rootDrivewsid, ...string[]],
): Effect<[O.Some<T.DetailsDocwsRoot>, ...O.Option<T.Details>[]]>
export function retrieveItemDetailsInFoldersSaving(
  drivewsids: [typeof trashDrivewsid, ...string[]],
): Effect<[O.Some<T.DetailsTrashRoot>, ...O.Option<T.Details>[]]>
export function retrieveItemDetailsInFoldersSaving<R extends T.Root>(
  drivewsids: [R['drivewsid'], ...string[]],
): Effect<[O.Some<R>, ...O.Option<T.Details>[]]>
export function retrieveItemDetailsInFoldersSaving(
  drivewsids: NEA<string>,
): Effect<NEA<O.Option<T.Details>>>
export function retrieveItemDetailsInFoldersSaving(
  drivewsids: NEA<string>,
): Effect<NEA<O.Option<T.Details>>> {
  return pipe(
    loggerIO.debug(`retrieveItemDetailsInFoldersSaving`),
    SRTE.fromIO,
    SRTE.chain(() =>
      pipe(
        retrieveItemDetailsInFoldersCached(drivewsids),
        usingCache(C.cachef()),
      )
    ),
  )
}

/** fails if some of the ids were not found */
export function retrieveItemDetailsInFoldersSavingStrict(
  drivewsids: NEA<string>,
): Effect<NEA<T.NonRootDetails>>
export function retrieveItemDetailsInFoldersSavingStrict(
  drivewsids: NEA<string>,
): Effect<NEA<T.Details>> {
  return pipe(
    retrieveItemDetailsInFoldersSaving(drivewsids),
    SRTE.chain(
      flow(
        O.sequenceArray,
        SRTE.fromOption(() => err(`some of the ids was not found`)),
        v => v as Effect<NEA<T.Details>>,
      ),
    ),
  )
}
