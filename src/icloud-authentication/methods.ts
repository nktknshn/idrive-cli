import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { DepAuthenticateSession } from '../deps-types'
import { BaseState } from '../icloud-core/icloud-request'
import { AccountData } from './type-accountdata'

export const authenticateSession = <S extends BaseState>(): SRTE.StateReaderTaskEither<
  S,
  DepAuthenticateSession,
  Error,
  AccountData
> =>
  SRTE.asksStateReaderTaskEitherW(
    (_: DepAuthenticateSession) => _.authenticateSession<S>(),
  )

export const authenticateState = <S extends BaseState>(
  state: S,
): RTE.ReaderTaskEither<
  DepAuthenticateSession,
  Error,
  S & { accountData: AccountData }
> =>
  pipe(
    authenticateSession<S>()(state),
    RTE.map(([accountData, state]) => ({ ...state, accountData })),
  )
