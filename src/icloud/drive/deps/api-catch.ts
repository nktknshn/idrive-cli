import { apply, constVoid, identity, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as T from 'fp-ts/lib/Task'
import * as TE from 'fp-ts/lib/TaskEither'
import { InvalidGlobalSessionError } from '../../../lib/errors'
import { FetchError } from '../../../lib/http/fetch-client'
import { loggerIO } from '../../../lib/loggerIO'
import { AuthorizedState, AuthorizeEnv, authorizeSession } from '../../authorization/authorize'

export type CatchFetchEnv = { retries: number; catchFetchErrors: boolean; retryDelay: number }

export type CatchSessEnv = AuthorizeEnv & { catchSessErrors: boolean }

const catchFetchErrorsTE = (triesLeft: number, retryDelay: number) =>
  <A>(
    m: TE.TaskEither<Error, A>,
  ): TE.TaskEither<Error, A> => {
    return pipe(
      m,
      TE.orElseFirst((e) =>
        FetchError.is(e)
          ? TE.fromIO(loggerIO.error(`try failed (${e}). retries left: ${triesLeft}`))
          : TE.of(constVoid())
      ),
      TE.orElse((e) =>
        triesLeft > 0 && FetchError.is(e)
          ? pipe(
            catchFetchErrorsTE(triesLeft - 1, retryDelay)(m),
            T.delay(retryDelay),
          )
          : TE.left(e)
      ),
    )
  }
export const catchFetchErrorsSRTE = ({ retries, retryDelay, catchFetchErrors }: CatchFetchEnv) =>
  <S, R, A>(
    m: SRTE.StateReaderTaskEither<S, R, Error, A>,
  ): SRTE.StateReaderTaskEither<S, R, Error, A> => {
    return (s: S) => (r: R) => pipe(m(s)(r), catchFetchErrors ? catchFetchErrorsTE(retries, retryDelay) : identity)
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
