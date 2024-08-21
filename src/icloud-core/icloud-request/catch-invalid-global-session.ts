import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { DepAuthorizeSession } from '../../deps-types/dep-authorize-session'
import { InvalidGlobalSessionError } from '../../util/errors'
import { EmptyObject } from '../../util/types'
import { AuthorizedState } from './lib/request'
// STE
export type CatchSessEnv = { catchSessErrors: boolean } & DepAuthorizeSession

/** Catches `InvalidGlobalSessionError`*/
export const catchSessErrorsSRTE = (
  deps: CatchSessEnv,
) =>
  <S extends AuthorizedState, R extends EmptyObject, A>(
    m: SRTE.StateReaderTaskEither<S, R, Error, A>,
  ): SRTE.StateReaderTaskEither<S, R, Error, A> => {
    return ((s: S) =>
      pipe(
        m(s),
        RTE.orElse(e =>
          deps.catchSessErrors && InvalidGlobalSessionError.is(e)
            ? pipe(
              deps.authorizeSession<S>()(s),
              RTE.chain(
                ([accountData, state]) => m({ ...state, accountData }),
              ),
            )
            : RTE.left(e)
        ),
      ))
  }
