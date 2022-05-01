import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { XX } from '../../../util/types'
import { authorizeSession as authorizeSession_ } from '../../authorization'
import { AccountData } from '../../authorization/types'
import { BasicState } from '../../request/request'
import { wrapRequest } from '../../request/request-wrapper'
import { basic } from './drive-api-impl'

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

export const authorizeSessionMethod = wrapRequest(basic)(authorizeSession_)
