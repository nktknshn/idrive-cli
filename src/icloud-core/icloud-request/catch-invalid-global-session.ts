import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { AuthenticateSession } from '../../deps-types/dep-authenticate-session'
import { InvalidGlobalSessionError } from '../../util/errors'
import { EmptyObject } from '../../util/types'
import { AuthenticatedState } from './lib/request'

export type CatchSessDeps = { catchSessErrors: boolean } & AuthenticateSession

/** Catches `InvalidGlobalSessionError` and tries to reauthenticate the session */
export const catchSessErrorsSRTE = (
  deps: CatchSessDeps,
) =>
  <S extends AuthenticatedState, R extends EmptyObject, A>(
    m: SRTE.StateReaderTaskEither<S, R, Error, A>,
  ): SRTE.StateReaderTaskEither<S, R, Error, A> => {
    return ((s: S) =>
      pipe(
        m(s),
        RTE.orElse(e =>
          deps.catchSessErrors && InvalidGlobalSessionError.is(e)
            ? pipe(
              deps.authenticateSession<S>()(s),
              RTE.chain(
                ([accountData, state]) => m({ ...state, accountData }),
              ),
            )
            : RTE.left(e)
        ),
      ))
  }
