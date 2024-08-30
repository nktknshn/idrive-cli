import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { DepAuthenticateSession, DepFs } from '../../deps-types'
import { cacheLogger } from '../../logging/logging'
import { DriveLookup } from '..'
import { loadDriveStateFromFiles } from './loadDriveStateFromFiles'
import { saveAccountData, saveCache, saveSession } from './saveSession'

type Deps =
  & { sessionFile: string }
  & { cacheFile: string; noCache: boolean }
  & DepAuthenticateSession
  & DepFs<'writeFile'>
  & DepFs<'readFile'>

/** Read the state from files and executes the action in the context. Unused currently */
export function driveAction<A, R, Args extends unknown[]>(
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
                + `, ${Object.keys(cache.byDrivewsid).length - Object.keys(oldCache.byDrivewsid).length} new items`,
            ),
        )
      ),
      RTE.chainFirstW(({ result: [, state] }) =>
        pipe(
          RTE.of(state),
          RTE.chainFirstW(saveSession),
          RTE.chainFirstW(saveAccountData),
          RTE.chainFirstW(saveCache),
        )
      ),
      RTE.map(_ => _.result[0]),
    )
}
