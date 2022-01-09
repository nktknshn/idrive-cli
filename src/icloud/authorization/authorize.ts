import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { FetchClientEither } from '../../lib/http/fetch-client'
import { authLogger, logger } from '../../lib/logging'
import { arrayFromOption } from '../../lib/util'
import * as AR from '../drive/requests/reader'
import { ICloudSession } from '../session/session'
import { requestAccoutLogin, requestAccoutLoginM } from './accoutLogin'
import { requestSecurityCode, requestSecurityCodeM } from './securitycode'
import { isHsa2Required, requestSignIn, requestSignInM } from './signin'
import { requestTrustDevice, requestTrustDeviceM } from './trust'
import { AccountLoginResponseBody } from './types'

export interface AuthorizeProps {
  getCode: () => TE.TaskEither<Error, string>
}

export interface ICloudSessionValidated {
  session: ICloudSession
  accountData: AccountLoginResponseBody
}

export function authorizeSession(
  client: FetchClientEither,
  session: ICloudSession,
  { getCode }: AuthorizeProps,
): TE.TaskEither<Error, ICloudSessionValidated> {
  authLogger.debug('authorizeSession')

  return pipe(
    requestSignIn(client, session, {
      accountName: session.username,
      password: session.password,
      trustTokens: arrayFromOption(session.trustToken),
    }),
    TE.map(({ session, response }) => ({
      session,
      hsa2: isHsa2Required(response.body),
    })),
    TE.chainW(({ session, hsa2 }) =>
      hsa2
        ? pipe(
          getCode(),
          TE.chainW((code) => requestSecurityCode(client, session, { code })),
          TE.chainW(({ session }) => requestTrustDevice(client, session)),
          TE.map(_ => _.session),
        )
        : TE.of(session)
    ),
    TE.chainW((session) => requestAccoutLogin(client, session)),
    TE.map(({ response, session }) => ({ session, accountData: response.body })),
  )
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
