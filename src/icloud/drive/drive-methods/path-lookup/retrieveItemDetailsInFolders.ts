import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import { err } from '../../../../util/errors'
import { NEA } from '../../../../util/types'
import * as API from '../../api'
import { chain, of } from '../../drive'
import { Effect, State } from '../../drive'
import * as T from '../../drive-types'
import { rootDrivewsid, trashDrivewsid } from '../../drive-types/types-io'
import { getMissedFound as createMissedFound } from '../../helpers'
import { putMissedFound } from './cache-methods'

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
    API.retrieveItemDetailsInFolders<State>({ drivewsids }),
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
