import * as A from 'fp-ts/Array'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'

import { string } from 'fp-ts'
import { loggerIO } from '../../../logging/loggerIO'
import { err } from '../../../util/errors'
import { NEA } from '../../../util/types'
import { sequenceNArrayO } from '../../../util/util'
import { Cache, DriveCache, DriveLookup, Types } from '../..'
import { DriveApiMethods } from '../../drive-api'
import { TypesIo } from '../../drive-types'

/** Retrieves actual drivewsids from cache or from api (if they are missing from cache) and removes those that were not found. If `apiUsage` is set to 'onlycache', the method will only retrieve details from cache. */
export function retrieveItemDetailsInFoldersCached<R extends Types.Root>(
  drivewsids: [R['drivewsid'], ...Types.NonRootDrivewsid[]],
): DriveLookup.Lookup<[O.Some<R>, ...O.Option<Types.NonRootDetails>[]]>
export function retrieveItemDetailsInFoldersCached(
  drivewsids: [typeof TypesIo.rootDrivewsid, ...string[]],
): DriveLookup.Lookup<[O.Some<Types.DetailsDocwsRoot>, ...O.Option<Types.Details>[]]>
export function retrieveItemDetailsInFoldersCached(
  drivewsids: [typeof TypesIo.trashDrivewsid, ...string[]],
): DriveLookup.Lookup<[O.Some<Types.DetailsTrashRoot>, ...O.Option<Types.Details>[]]>
export function retrieveItemDetailsInFoldersCached<R extends Types.Root>(
  drivewsids: [R['drivewsid'], ...string[]],
): DriveLookup.Lookup<[O.Some<R>, ...O.Option<Types.Details>[]]>
export function retrieveItemDetailsInFoldersCached(
  drivewsids: NEA<string>,
): DriveLookup.Lookup<NEA<O.Option<Types.Details>>>
export function retrieveItemDetailsInFoldersCached(
  drivewsids: NEA<string>,
): DriveLookup.Lookup<NEA<O.Option<Types.Details>>> {
  const uniqids = pipe(drivewsids, NA.uniq(string.Eq))

  return pipe(
    () => loggerIO.debug(`retrieveItemDetailsInFoldersCached: ${uniqids}`),
    SRTE.fromIO,
    SRTE.chain(DriveLookup.ask),
    SRTE.bindTo('deps'),
    SRTE.bindW('cached', () => DriveCache.getsCache(Cache.getFoldersDetailsByIdsSeparated(uniqids))),
    SRTE.chainW(({ deps: { apiUsage }, cached }) =>
      pipe(
        cached.missed,
        A.matchW(
          () => DriveLookup.of({ missed: [], found: [] }),
          (missed) =>
            apiUsage === 'onlycache'
              ? DriveLookup.of({ missed: [], found: [] })
              : DriveApiMethods.retrieveItemDetailsInFoldersSeparated<DriveLookup.State>(missed),
        ),
      )
    ),
    SRTE.chain(DriveCache.putMissedFound),
    SRTE.chainW(() => DriveCache.getsCache(Cache.getFoldersDetailsByIds(drivewsids))),
    SRTE.map(NA.map(Types.invalidIdToOption)),
  )
}

/** Fails if some of the ids were not found */
export function retrieveItemDetailsInFoldersCachedStrict(
  drivewsids: NEA<string>,
): DriveLookup.Lookup<NEA<Types.NonRootDetails>>
export function retrieveItemDetailsInFoldersCachedStrict(
  drivewsids: NEA<string>,
): DriveLookup.Lookup<NEA<Types.Details>> {
  return pipe(
    retrieveItemDetailsInFoldersCached(drivewsids),
    SRTE.chain(res =>
      SRTE.fromOption(() => err(`some of the ids was not found`))(
        sequenceNArrayO(res),
      )
    ),
  )
}
