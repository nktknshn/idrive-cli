import { constVoid, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { DepFs } from '../../deps-types'
import { loggerIO } from '../../logging'
import { debugTimeRTE } from '../../logging/debug-time'
import { ReadJsonFileError } from '../../util/files'
import { Cache } from '..'

export type DepsLoad =
  & { noCache: boolean; cacheFile: string }
  & DepFs<'readFile'>

export type DepsSave =
  & { cacheFile: string; noCache: boolean }
  & DepFs<'writeFile'>

export const loadCacheFromFile: RTE.ReaderTaskEither<
  DepsLoad,
  Error | ReadJsonFileError,
  Cache.LookupCache
> = RTE.asksReaderTaskEitherW((deps: { noCache: boolean; cacheFile: string }) =>
  pipe(
    deps.noCache
      ? RTE.of(Cache.cache())
      : pipe(
        RTE.fromIO(loggerIO.debug(`loadCacheFromFile(${deps.cacheFile})`)),
        RTE.chain(() => Cache.tryReadFromFile(deps.cacheFile)),
      ),
    RTE.orElseW(
      (e) =>
        pipe(
          loggerIO.error(`couldn't read cache from file. (${e}). Creating new cache`),
          RTE.fromIO,
          RTE.map(() => Cache.cache()),
        ),
    ),
    RTE.chainFirstIOK((c) => loggerIO.debug(`loaded cache: ${Cache.keysCount(c)} items`)),
  )
)

export const saveCacheToFile = <S extends { cache: Cache.LookupCache }>(
  state: S,
): RTE.ReaderTaskEither<DepsSave, Error, void> => {
  return pipe(
    RTE.asksReaderTaskEitherW((deps: DepsSave) =>
      deps.noCache
        ? RTE.of(constVoid())
        : Cache.trySaveFile(state.cache)(deps.cacheFile)
    ),
    debugTimeRTE('saveCache'),
  )
}
