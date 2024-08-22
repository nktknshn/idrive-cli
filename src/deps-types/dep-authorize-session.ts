import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { type AccountData } from '../icloud-authorization/type-accountdata'
import { BaseState } from '../icloud-core/icloud-request'
import { XX } from '../util/types'

export type DepAuthorizeSession = {
  authorizeSession: <S extends BaseState>() => XX<S, AccountData>
}

export const authorizeSession = <S extends BaseState>() =>
  SRTE.asksStateReaderTaskEitherW(
    (_: DepAuthorizeSession) => _.authorizeSession<S>(),
  )
/** higher level methods based and dependent on the basic functions */

export const authorizeState = <
  S extends BaseState,
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
