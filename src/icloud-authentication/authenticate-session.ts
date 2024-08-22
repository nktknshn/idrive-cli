import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as AR from '../icloud-core/icloud-request/lib/request'
import { authLogger } from '../logging/logging'
import { Getcode } from '../util/prompts'
import { requestAccoutLogin } from './requests/accoutlogin'
import { requestSecurityCode } from './requests/securitycode'
import { isHsa2Required, requestSignIn } from './requests/signin'
import { requestTrustDevice } from './requests/trust'
import { type AccountData } from './type-accountdata'

/** Depends on fetch client and confirmation code user input */
export type AuthenticateSessionDeps = AR.RequestDeps & { getCode: Getcode }

/** Authenticates a session returning `AccountData`*/
export function authenticateSession<S extends AR.BaseState>(): AR.ApiRequest<AccountData, S, AuthenticateSessionDeps> {
  authLogger.debug('authenticateSession')

  return pipe(
    requestSignIn<S>(),
    SRTE.chain((resp) =>
      isHsa2Required(resp)
        ? pipe(
          SRTE.ask<S, AuthenticateSessionDeps>(),
          SRTE.chain(({ getCode }) => SRTE.fromTaskEither(getCode())),
          SRTE.chainW(code => requestSecurityCode(code)),
          SRTE.chainW(() => requestTrustDevice()),
        )
        : SRTE.of({})
    ),
    SRTE.chainW(() => requestAccoutLogin()),
  )
}
