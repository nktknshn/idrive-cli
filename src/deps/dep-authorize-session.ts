import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { AccountData } from '../icloud/authorization/types'
import { BasicState } from '../icloud/request/request'
import { XX } from '../util/types'

export type DepAuthorizeSession = {
  authorizeSession: <S extends BasicState>() => XX<S, AccountData>
}

export const authorizeSession = <S extends BasicState>() =>
  SRTE.asksStateReaderTaskEitherW(
    (_: DepAuthorizeSession) => _.authorizeSession<S>(),
  )
/** higher level methods based and dependent on the basic functions */

export const authorizeState = <
  S extends BasicState,
>(
  state: S,
): RTE.ReaderTaskEither<
  DepAuthorizeSession,
  Error,
  S & { accountData: AccountData }
> =>
  pipe(
    authorizeSession<S>()(state),
    RTE.map(([accountData, state]) => ({ ...state, accountData })),
  )
