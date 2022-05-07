import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as AR from '../icloud-core/icloud-request/lib/request'
import { authLogger } from '../util/logging'
import { Getcode } from '../util/prompts'
import { requestAccoutLoginM } from './requests/accoutLogin'
import { requestSecurityCodeM } from './requests/securitycode'
import { isHsa2Required, requestSignInM } from './requests/signin'
import { requestTrustDeviceM } from './requests/trust'
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

// export function authorizeState<
//   S extends AR.BasicState,
// >(state: S): RTE.ReaderTaskEither<AuthorizeEnv, Error, { accountData: AccountData } & S> {
//   authLogger.debug('authorizeSession')

//   return pipe(
//     authorizeSession<S>()(state),
//     RTE.map(([accountData, state]) => ({ ...state, accountData })),
//   )
// }
