import * as A from 'fp-ts/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { Eq } from 'fp-ts/lib/string'
import * as O from 'fp-ts/Option'
import { err } from '../../../util/errors'
import { NEA } from '../../../util/types'
import { recordFromTuples } from '../../../util/util'
import { C, DriveApi } from '../..'
import * as API from '../../drive-api'
import * as T from '../../icloud-drive-items-types'
import { rootDrivewsid, trashDrivewsid } from '../../icloud-drive-items-types/types-io'
import { getMissedFound as createMissedFound } from '../../util/drive-helpers'
import { chain, of } from '..'
import { Effect, State } from '..'
import { asksCache, chainCache, putMissedFound } from './cache-methods'
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
  const u = pipe(
    drivewsids,
    NA.uniq(Eq),
  )

  return pipe(
    API.retrieveItemDetailsInFolders<State>({ drivewsids: u }),
    SRTE.map((details) =>
      pipe(
        drivewsids,
        NA.map(dwid => pipe(u, NA.zip(details), recordFromTuples)[dwid]),
      )
    ),
    chain((details) =>
      pipe(
        createMissedFound(drivewsids, details),
        putMissedFound,
        chain(() => of(NA.map(T.invalidIdToOption)(details))),
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
/** returns details from cache if they are there otherwise fetches them from icloid api.   */
export const retrieveItemDetailsInFoldersCached = (
  drivewsids: NEA<string>,
): Effect<NEA<T.MaybeInvalidId<T.Details>>> => {
  return pipe(
    chainCache(
      SRTE.fromEitherK(C.getFoldersDetailsByIdsSeparated(drivewsids)),
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
    SRTE.map(NA.map(T.invalidIdToOption)),
    SRTE.chain(
      flow(
        O.sequenceArray,
        SRTE.fromOption(() => err(`some of the ids was not found`)),
        v => v as Effect<NEA<T.Details>>,
      ),
    ),
  )
}
