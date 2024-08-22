import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { type AccountData } from '../icloud-authentication/type-accountdata'
import { BaseState } from '../icloud-core/icloud-request'
import { SA } from '../util/types'

export type AuthenticateSession = {
  authenticateSession: <S extends BaseState>() => SA<S, AccountData>
}

export const authenticateSession = <S extends BaseState>(): SRTE.StateReaderTaskEither<
  S,
  AuthenticateSession,
  Error,
  AccountData
> =>
  SRTE.asksStateReaderTaskEitherW(
    (_: AuthenticateSession) => _.authenticateSession<S>(),
  )

export const authenticateState = <
  S extends BaseState,
>(
  state: S,
): RTE.ReaderTaskEither<
  AuthenticateSession,
  Error,
  S & { accountData: AccountData }
> =>
  pipe(
    authenticateSession<S>()(state),
    RTE.map(([accountData, state]) => ({ ...state, accountData })),
  )
