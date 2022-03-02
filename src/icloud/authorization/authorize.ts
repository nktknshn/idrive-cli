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

export interface ICloudSessionValidated {
  session: ICloudSession
  accountData: AccountLoginResponseBody
}

export function authorizeSessionM<S extends AR.State>(): AR.ApiRequest<AccountLoginResponseBody, S> {
  authLogger.debug('authorizeSession')

  return pipe(
    requestSignInM<S>(),
    AR.chain((resp) =>
      isHsa2Required(resp)
        ? pipe(
          AR.readEnv<S>(),
          AR.chain(({ env }) => AR.fromTaskEither(env.getCode())),
          AR.chain(code => requestSecurityCodeM(code)),
          AR.chain(() => requestTrustDeviceM()),
        )
        : AR.of({})
    ),
    AR.chain(() => requestAccoutLoginM()),
  )
}
export function authorizeSessionM2<
  S extends AR.State & {
    loadedAccountData: O.Option<AccountLoginResponseBody>
  },
>(
  state: S,
): RTE.ReaderTaskEither<
  AR.Env,
  Error,
  {
    accountData: AccountLoginResponseBody
  } & S
> {
  authLogger.debug('authorizeSession')

  return pipe(
    state.loadedAccountData,
    O.fold(
      () =>
        pipe(
          authorizeSessionM<S>()(state),
          RTE.map(([accountData, session]) => ({
            ...session,
            accountData,
          })),
        ),
      accountData => RTE.of({ ...state, accountData }),
    ),
  )
}

export function authorizeStateM3<
  S extends AR.State,
  R extends AR.Env,
>(state: S): RTE.ReaderTaskEither<R, Error, { accountData: AccountLoginResponseBody } & S> {
  authLogger.debug('authorizeSession')

  return pipe(
    authorizeSessionM<S>()(state),
    RTE.map(([accountData, state]) => ({ ...state, accountData })),
  )
}

export function authorizeSessionRTE<S extends AR.State>() {
  authLogger.debug('authorizeSession')

  return (s: S) =>
    pipe(
      requestSignInM<S>(),
      AR.chain((resp) =>
        isHsa2Required(resp)
          ? pipe(
            AR.readEnv<S>(),
            AR.chain(({ env }) => AR.fromTaskEither(env.getCode())),
            AR.chain(code => requestSecurityCodeM(code)),
            AR.chain(() => requestTrustDeviceM()),
          )
          : AR.of({})
      ),
      AR.chain(() => requestAccoutLoginM()),
      apply(s),
      RTE.map(([accountData, state]) => ({ accountData, ...state })),
    )
}

export function authorizeSessionSRTE<S extends ICloudSessionValidated>() {
  authLogger.debug('authorizeSession')

  return pipe(
    requestSignInM<S>(),
    AR.chain((resp) =>
      isHsa2Required(resp)
        ? pipe(
          AR.readEnv<S>(),
          AR.chain(({ env }) => AR.fromTaskEither(env.getCode())),
          AR.chain(code => requestSecurityCodeM(code)),
          AR.chain(() => requestTrustDeviceM()),
        )
        : AR.of({})
    ),
    AR.chain(() => requestAccoutLoginM()),
    AR.chain((accountData) => SRTE.modify(s => ({ ...s, accountData }))),
    AR.map(constVoid),
  )
}
