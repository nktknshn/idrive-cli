import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { DepAuthenticateSession, DepFs } from '../../deps-types'
import { cacheLogger } from '../../logging/logging'
import { Cache, DriveLookup } from '..'
import { loadDriveStateFromFiles, saveDriveStateToFiles } from './state'

type Deps =
  & { sessionFile: string }
  & { cacheFile: string; noCache: boolean }
  & DepAuthenticateSession
  & DepFs<'writeFile'>
  & DepFs<'readFile'>

/** Load state, execute the action and save state afterwards. */
export function persistentDriveState<A, R, Args extends unknown[]>(
  action: (...args: Args) => DriveLookup.Lookup<A, R>,
): (...args: Args) => RTE.ReaderTaskEither<R & Deps, Error, A> {
  return (...args: Args) =>
    pipe(
      loadDriveStateFromFiles,
      RTE.bindW('result', action(...args)),
      RTE.chainFirst(({ cache: oldCache, result: [, { cache }] }) =>
        RTE.fromIO(
          () => {
            const total = Cache.keysCount(cache)
            const { added, removed } = Cache.keysAddRemove(oldCache, cache)
            cacheLogger.debug(
              `Saving cache: ${total} items. New items: ${added.length}, removed items: ${removed.length}`,
            )
          },
        )
      ),
      RTE.chainFirstW(({ result: [, state] }) => saveDriveStateToFiles(state)),
      RTE.map(_ => _.result[0]),
    )
}
