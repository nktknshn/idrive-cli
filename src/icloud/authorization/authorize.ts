import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { authLogger } from '../../lib/logging'
import * as AR from '../drive/requests/reader'
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

export function authorizeSessionM<S extends AR.State>(): AR.ApiSessionRequest<AccountLoginResponseBody, S> {
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
