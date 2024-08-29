import * as A from 'fp-ts/Array'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { Eq } from 'fp-ts/lib/string'
import * as O from 'fp-ts/Option'
import { loggerIO } from '../../../logging/loggerIO'
import { err } from '../../../util/errors'
import { NEA } from '../../../util/types'
import { sequenceArrayO } from '../../../util/util'
import { Cache, DriveLookup, Types } from '../..'
import { DriveApiMethods } from '../../drive-api'
import { rootDrivewsid, trashDrivewsid } from '../../drive-types/types-io'
import { Lookup, State } from '..'
import { chainCache, getCache, getsCache, putMissedFound } from './cache-methods'

/** Retrieves actual drivewsids saving valid ones to cache and removing those that were not found */
export function retrieveItemDetailsInFoldersCached<R extends Types.Root>(
  drivewsids: [R['drivewsid'], ...Types.NonRootDrivewsid[]],
): Lookup<[O.Some<R>, ...O.Option<Types.NonRootDetails>[]]>
export function retrieveItemDetailsInFoldersCached(
  drivewsids: [typeof rootDrivewsid, ...string[]],
): Lookup<[O.Some<Types.DetailsDocwsRoot>, ...O.Option<Types.Details>[]]>
export function retrieveItemDetailsInFoldersCached(
  drivewsids: [typeof trashDrivewsid, ...string[]],
): Lookup<[O.Some<Types.DetailsTrashRoot>, ...O.Option<Types.Details>[]]>
export function retrieveItemDetailsInFoldersCached<R extends Types.Root>(
  drivewsids: [R['drivewsid'], ...string[]],
): Lookup<[O.Some<R>, ...O.Option<Types.Details>[]]>
export function retrieveItemDetailsInFoldersCached(
  drivewsids: NEA<string>,
): Lookup<NEA<O.Option<Types.Details>>>
export function retrieveItemDetailsInFoldersCached(
  drivewsids: NEA<string>,
): Lookup<NEA<O.Option<Types.Details>>> {
  const uniqids = pipe(drivewsids, NA.uniq(Eq))

  return pipe(
    getCache(),
    SRTE.chain(
      c =>
        SRTE.fromIO(
          loggerIO.debug(`retrieveItemDetailsInFoldersCached: ${Cache.getAllDetails(c).map(_ => _.drivewsid)}`),
        ),
    ),
    SRTE.chain(() =>
      chainCache(
        SRTE.fromEitherK(Cache.getFoldersDetailsByIdsSeparated(uniqids)),
      )
    ),
    SRTE.chainW(({ missed }) =>
      pipe(
        missed,
        A.matchW(
          () => DriveLookup.of({ missed: [], found: [] }),
          (missed) => DriveApiMethods.retrieveItemDetailsInFoldersSeparated<State>(missed),
        ),
      )
    ),
    SRTE.chain(putMissedFound),
    SRTE.chainW(() => getsCache(Cache.getFoldersDetailsByIds(drivewsids))),
    SRTE.chainW(e => SRTE.fromEither(e)),
    SRTE.map(NA.map(Types.invalidIdToOption)),
  )
}

/** Fails if some of the ids were not found */
export function retrieveItemDetailsInFoldersCachedStrict(
  drivewsids: NEA<string>,
): Lookup<NEA<Types.NonRootDetails>>
export function retrieveItemDetailsInFoldersCachedStrict(
  drivewsids: NEA<string>,
): Lookup<NEA<Types.Details>> {
  return pipe(
    retrieveItemDetailsInFoldersCached(drivewsids),
    SRTE.chain(res =>
      SRTE.fromOption(() => err(`some of the ids was not found`))(
        sequenceArrayO(res),
      )
    ),
  )
}
