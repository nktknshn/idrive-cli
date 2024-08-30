import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { DepAuthenticateSession, DepFs } from '../../deps-types'
import { cacheLogger } from '../../logging/logging'
import { DriveLookup } from '..'
import { saveAccountDataToFile } from './account-data'
import { saveCacheToFile } from './cache'
import { saveSessionToFile } from './session'
import { loadDriveStateFromFiles } from './state'

type Deps =
  & { sessionFile: string }
  & { cacheFile: string; noCache: boolean }
  & DepAuthenticateSession
  & DepFs<'writeFile'>
  & DepFs<'readFile'>

/** Read the state from files and executes the action in the context. Unused currently */
export function persistentDriveState<A, R, Args extends unknown[]>(
  action: (...args: Args) => DriveLookup.Lookup<A, R>,
): (...args: Args) => RTE.ReaderTaskEither<R & Deps, Error, A> {
  return (...args: Args) =>
    pipe(
      loadDriveStateFromFiles,
      RTE.bindW('result', action(...args)),
      RTE.chainFirst(({ cache: oldCache, result: [, { cache }] }) =>
        RTE.fromIO(
          () =>
            cacheLogger.debug(
              `saving cache: ${Object.keys(cache.byDrivewsid).length} items`
                + `\n${Object.keys(cache.byDrivewsid).length - Object.keys(oldCache.byDrivewsid).length} new items`,
            ),
        )
      ),
      RTE.chainFirstW(({ result: [, state] }) =>
        pipe(
          RTE.of(state),
          RTE.chainFirstW(saveSessionToFile),
          RTE.chainFirstW(saveAccountDataToFile),
          RTE.chainFirstW(saveCacheToFile),
        )
      ),
      RTE.map(_ => _.result[0]),
    )
}
