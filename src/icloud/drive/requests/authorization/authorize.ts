import { pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import { FetchClientEither } from '../../../../lib/http/fetch-client'
import { authLogger, logger } from '../../../../lib/logging'
import { arrayFromOption } from '../../../../lib/util'
import { ICloudSession } from '../../../session/session'
import { requestAccoutLogin } from './accoutLogin'
import { requestSecurityCode } from './securitycode'
import { hsa2Required, requestSignIn } from './signin'
import { requestTrustDevice } from './trust'
import { AccountLoginResponseBody } from './types'

export interface AuthorizeProps {
  getCode: TE.TaskEither<Error, string>
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
      hsa2: hsa2Required(response.body),
    })),
    TE.chainW(({ session, hsa2 }) =>
      hsa2
        ? pipe(
          getCode,
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
