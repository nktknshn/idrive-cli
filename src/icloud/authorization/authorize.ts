import { constVoid, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
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
import * as O from 'fp-ts/Option'
export function authorizeSessionM2<
  S extends AR.State & {
    loadedAccountData: O.Option<AccountLoginResponseBody>
  },
>(
  session: S,
): RTE.ReaderTaskEither<
  AR.Env,
  Error,
  {
    accountData: AccountLoginResponseBody
  } & S
> {
  authLogger.debug('authorizeSession')

  return pipe(
    session.loadedAccountData,
    O.fold(
      () =>
        pipe(
          authorizeSessionM<S>()(session),
          RTE.map(([accountData, session]) => ({
            ...session,
            accountData,
          })),
        ),
      accountData => RTE.of({ ...session, accountData }),
    ),
  )
}

export function authorizeSessionM3<
  S extends AR.State & {},
>(
  session: S,
): RTE.ReaderTaskEither<
  AR.Env,
  Error,
  { accountData: AccountLoginResponseBody } & S
> {
  authLogger.debug('authorizeSession')

  return pipe(
    authorizeSessionM<S>()(session),
    RTE.map(([accountData, session]) => ({
      ...session,
      accountData,
    })),
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
      f => f(s),
      RTE.map(([accountData, session]) => ({ accountData, ...session })),
    )
}

export function authorizeSessionSRTE<S extends AR.State>() {
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
