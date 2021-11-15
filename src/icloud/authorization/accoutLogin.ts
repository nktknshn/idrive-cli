import { apply, flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import { defaultCountryCode } from '../../config'
import { err } from '../../lib/errors'
import { FetchClientEither } from '../../lib/fetch-client'
import { logger } from '../../lib/logging'
import { expectJson } from '../../lib/response-reducer'
import { isObjectWithOwnProperty } from '../../lib/util'
import { ICloudSession } from '../session/session'
import { buildRequest } from '../session/session-http'
import { ICloudSessionValidated } from './authorize'
import { AccountLoginResponseBody } from './types'

export function requestAccoutLogin(
  client: FetchClientEither,
  session: ICloudSession,
): TE.TaskEither<Error, ICloudSessionValidated> {
  logger.debug('requestAccoutLogin')

  const applyResponse = expectJson(
    (json): json is AccountLoginResponseBody => isObjectWithOwnProperty(json, 'appsOrder'),
  )

  return pipe(
    session.sessionToken,
    TE.fromOption(() => err('session missing sessionToken')),
    TE.map((sessionToken) =>
      buildRequest(
        'POST',
        'https://setup.icloud.com/setup/ws/1/accountLogin?clientBuildNumber=2114Project37&clientMasteringNumber=2114B28&clientId=f4058d20-0430-4cd5-bb85-7eb9b47fc94e',
        {
          data: {
            dsWebAuthToken: sessionToken,
            trustToken: O.toUndefined(session.trustToken),
            accountCountryCode: pipe(
              session.accountCountry,
              O.getOrElse(() => defaultCountryCode),
            ),
            extended_login: false,
          },
        },
      )
    ),
    TE.chainW(flow(apply(session), client)),
    applyResponse(session),
    TE.map(({ session, response }) => ({ session, accountData: response.body })),
  )
}
