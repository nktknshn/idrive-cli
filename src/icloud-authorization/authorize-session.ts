import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as AR from '../icloud-core/icloud-request/lib/request'
import { authLogger } from '../util/logging'
import { Getcode } from '../util/prompts'
import { requestAccoutLogin } from './requests/accoutLogin'
import { requestSecurityCode } from './requests/securitycode'
import { isHsa2Required, requestSignIn } from './requests/signin'
import { requestTrustDevice } from './requests/trust'
import { AccountData } from './types'

/**  */
export type AuthorizeDeps = AR.RequestDeps & { getCode: Getcode }

/** Authorizes a session returning `AccountData`*/
export function authorizeSession<S extends AR.BaseState>(): AR.ApiRequest<AccountData, S, AuthorizeDeps> {
  authLogger.debug('authorizeSession')

  return pipe(
    requestSignIn<S>(),
    SRTE.chain((resp) =>
      isHsa2Required(resp)
        ? pipe(
          SRTE.ask<S, AuthorizeDeps>(),
          SRTE.chain(({ getCode }) => SRTE.fromTaskEither(getCode())),
          SRTE.chainW(code => requestSecurityCode(code)),
          SRTE.chainW(() => requestTrustDevice()),
        )
        : SRTE.of({})
    ),
    SRTE.chainW(() => requestAccoutLogin()),
  )
}
