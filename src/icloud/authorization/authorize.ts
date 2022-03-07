import { apply, constVoid, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as O from 'fp-ts/Option'
import { authLogger } from '../../lib/logging'
import * as AR from '../drive/requests/request'
import { ICloudSession } from '../session/session'
import { requestAccoutLoginM } from './accoutLogin'
import { requestSecurityCodeM } from './securitycode'
import { isHsa2Required, requestSignInM } from './signin'
import { requestTrustDeviceM } from './trust'
import { AccountLoginResponseBody } from './types'

export interface AuthorizedState {
  session: ICloudSession
  accountData: AccountLoginResponseBody
}

export function authorizeSessionM<S extends AR.BasicState>(): AR.ApiRequest<AccountLoginResponseBody, S> {
  authLogger.debug('authorizeSession')

  return pipe(
    requestSignInM<S>(),
    SRTE.chain((resp) =>
      isHsa2Required(resp)
        ? pipe(
          SRTE.ask<S, AR.RequestEnv>(),
          SRTE.chain(({ getCode }) => SRTE.fromTaskEither(getCode())),
          SRTE.chain(code => requestSecurityCodeM(code)),
          SRTE.chain(() => requestTrustDeviceM()),
        )
        : SRTE.of({})
    ),
    SRTE.chain(() => requestAccoutLoginM()),
  )
}

export function authorizeStateM3<
  S extends AR.BasicState,
>(state: S): RTE.ReaderTaskEither<AR.RequestEnv, Error, { accountData: AccountLoginResponseBody } & S> {
  authLogger.debug('authorizeSession')

  return pipe(
    authorizeSessionM<S>()(state),
    RTE.map(([accountData, state]) => ({ ...state, accountData })),
  )
}
