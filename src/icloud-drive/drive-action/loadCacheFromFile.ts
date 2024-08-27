import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { DepFs } from '../../deps-types'
import { ReadJsonFileError } from '../../util/files'
import { Cache } from '..'

export type Deps =
  & { noCache: boolean; cacheFile: string }
  & DepFs<'readFile'>

export const loadCacheFromFile: RTE.ReaderTaskEither<
  Deps,
  Error | ReadJsonFileError,
  Cache.LookupCache
> = RTE.asksReaderTaskEitherW((deps: { noCache: boolean; cacheFile: string }) =>
  pipe(
    deps.noCache
      ? RTE.of(Cache.cachef())
      : Cache.tryReadFromFile(deps.cacheFile),
    RTE.orElse(
      () => RTE.of(Cache.cachef()),
    ),
  )
)
