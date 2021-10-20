import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { constant, flow, identity, pipe } from 'fp-ts/lib/function'
import * as J from 'fp-ts/lib/Json'
import * as O from 'fp-ts/lib/Option'
import * as ROR from 'fp-ts/lib/ReadonlyRecord'
import * as R from 'fp-ts/lib/Record'
import * as TE from 'fp-ts/lib/TaskEither'
import { error } from '../../lib/errors'
import { cacheLogger, logReturn } from '../../lib/logging'
import { Cache } from './cache/cachef'
import { DriveApi } from './drive-api'
import { DriveChildrenItem, DriveDetails, isRootDetails, rootDrivewsid } from './types'

const getRoot = (
  cache: Cache,
  api: DriveApi,
): TE.TaskEither<Error, { cache: Cache; details: DriveDetails }> => {
  return pipe(
    cachingRetrieveItemDetailsInFolder({ drivewsid: rootDrivewsid, cache, api }),
    TE.filterOrElseW(flow(_ => isRootDetails(_.details)), () => error(`invalid root details`)),
  )
}

const cachingRetrieveItemDetailsInFolder = (
  { drivewsid, cache, api }: { drivewsid: string; cache: Cache; api: DriveApi },
) => {
  return pipe(
    cachingRetrieveItemDetailsInFolders([drivewsid], cache, api),
    TE.map(({ cache, details }) => ({
      cache,
      details: details[0],
    })),
  )
}

const cachingRetrieveItemDetailsInFolders = (
  drivewsids: string[],
  cache: Cache,
  api: DriveApi,
) => {
  return pipe(
    drivewsids,
    A.map(id => pipe(cache.getFolderDetailsById(id), E.fromOption(() => id))),
    A.separate,
    logReturn(({ left, right }) => cacheLogger.debug(`${left.length} missed caches (${left}), ${right.length} hits`)),
    ({ left, right: cached }) =>
      pipe(
        TE.Do,
        TE.bind('cached', () => TE.fromEither(E.sequenceArray(cached))),
        TE.bind('details', () =>
          left.length > 0
            ? api.retrieveItemDetailsInFolders(left)
            : TE.of([])),
        TE.bind('cache', ({ details }) => pipe(cache.putDetailss(details), TE.fromEither)),
        // TE.chainFirstW(({ cache }) => this.cacheSet(cache)),
        TE.map(
          ({ cached, details, cache }) => ({
            details: pipe([...cached.map(_ => _.content)], A.concat(details)),
            cache,
          }),
        ),
      ),
  )
}
