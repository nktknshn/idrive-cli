import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { Getcode } from '../../util/input'
import { authLogger } from '../../util/logging'
import * as AR from '../drive/requests/request'
import { requestAccoutLoginM } from './accoutLogin'
import { requestSecurityCodeM } from './securitycode'
import { isHsa2Required, requestSignInM } from './signin'
import { requestTrustDeviceM } from './trust'
import { AccountData } from './types'

export type AuthorizeEnv = AR.RequestEnv & { getCode: Getcode }

export function authorizeSession<S extends AR.BasicState>(): AR.ApiRequest<AccountData, S, AuthorizeEnv> {
  authLogger.debug('authorizeSession')

  return pipe(
    requestSignInM<S>(),
    SRTE.chain((resp) =>
      isHsa2Required(resp)
        ? pipe(
          SRTE.ask<S, AuthorizeEnv>(),
          SRTE.chain(({ getCode }) => SRTE.fromTaskEither(getCode())),
          SRTE.chainW(code => requestSecurityCodeM(code)),
          SRTE.chainW(() => requestTrustDeviceM()),
        )
        : SRTE.of({})
    ),
    SRTE.chainW(() => requestAccoutLoginM()),
  )
}

export function authorizeState<
  S extends AR.BasicState,
>(state: S): RTE.ReaderTaskEither<AuthorizeEnv, Error, { accountData: AccountData } & S> {
  authLogger.debug('authorizeSession')

  return pipe(
    authorizeSession<S>()(state),
    RTE.map(([accountData, state]) => ({ ...state, accountData })),
  )
}
