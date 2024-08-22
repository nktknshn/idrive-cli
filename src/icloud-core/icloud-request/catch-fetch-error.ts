import { constVoid, identity, pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as T from 'fp-ts/lib/Task'
import * as TE from 'fp-ts/lib/TaskEither'
import { loggerIO } from '../../logging/loggerIO'
import { EmptyObject } from '../../util/types'

export type CatchFetchDeps = {
  catchFetchErrorsRetries: number
  catchFetchErrors: boolean
  catchFetchErrorsRetryDelay: number
  isFetchError: (e: Error) => boolean
}

/** Catch fetch errors and retry */
const catchFetchErrorsTE = (
  { isFetchError, catchFetchErrorsRetries, catchFetchErrorsRetryDelay, catchFetchErrors }: CatchFetchDeps,
) =>
  <A>(
    m: TE.TaskEither<Error, A>,
  ): TE.TaskEither<Error, A> => {
    return pipe(
      m,
      TE.orElseFirst((e) =>
        isFetchError(e)
          ? TE.fromIO(loggerIO.error(`try failed (${e}). retries left: ${catchFetchErrorsRetries}`))
          : TE.of(constVoid())
      ),
      TE.orElse((e) =>
        catchFetchErrorsRetries > 0 && isFetchError(e)
          ? pipe(
            catchFetchErrorsTE({
              isFetchError,
              catchFetchErrorsRetries: catchFetchErrorsRetries - 1,
              catchFetchErrorsRetryDelay,
              catchFetchErrors,
            })(m),
            T.delay(catchFetchErrorsRetryDelay),
          )
          : TE.left(e)
      ),
    )
  }

export const catchFetchErrorsSRTE = (
  env: CatchFetchDeps,
) =>
  <S, R extends EmptyObject, A>(
    m: SRTE.StateReaderTaskEither<S, R, Error, A>,
  ): SRTE.StateReaderTaskEither<S, R, Error, A> => {
    return (s: S) => (r: R) => pipe(m(s)(r), env.catchFetchErrors ? catchFetchErrorsTE(env) : identity)
  }
