import { apply, constVoid, identity, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as T from 'fp-ts/lib/Task'
import * as TE from 'fp-ts/lib/TaskEither'
import { InvalidGlobalSessionError } from '../../util/errors'
import { FetchError, HttpResponse } from '../../util/http/fetch-client'
import { loggerIO } from '../../util/loggerIO'
import { AuthorizeEnv, authorizeSession } from '../authorization/authorize-session'
import { AuthorizedState } from './request'

export type CatchFetchEnv = {
  catchFetchErrorsRetries: number
  catchFetchErrors: boolean
  catchFetchErrorsRetryDelay: number
  isFetchError: (e: Error) => boolean
}

export type CatchSessEnv = { catchSessErrors: boolean }

const catchFetchErrorsTE = (
  { isFetchError, catchFetchErrorsRetries, catchFetchErrorsRetryDelay, catchFetchErrors }: CatchFetchEnv,
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
  env: CatchFetchEnv,
) =>
  <S, R, A>(
    m: SRTE.StateReaderTaskEither<S, R, Error, A>,
  ): SRTE.StateReaderTaskEither<S, R, Error, A> => {
    return (s: S) =>
      (r: R) =>
        pipe(
          m(s)(r),
          env.catchFetchErrors ? catchFetchErrorsTE(env) : identity,
        )
  }

export const catchSessErrorsSRTE = (deps: CatchFetchEnv & AuthorizeEnv & CatchSessEnv) =>
  <S extends AuthorizedState, R, A>(
    m: SRTE.StateReaderTaskEither<S, R, Error, A>,
  ): SRTE.StateReaderTaskEither<S, R, Error, A> => {
    return ((s: S) =>
      pipe(
        m(s),
        RTE.orElse(e =>
          deps.catchSessErrors && InvalidGlobalSessionError.is(e)
            ? pipe(
              authorizeSession<S>(),
              catchFetchErrorsSRTE(deps),
              apply(s),
              RTE.local(() => (deps)),
              RTE.chain(
                ([accountData, state]) => m({ ...state, accountData }),
              ),
            )
            : RTE.left(e)
        ),
      ))
  }
