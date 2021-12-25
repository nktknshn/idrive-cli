import { apply, flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import * as t from 'io-ts'
import { defaultCountryCode } from '../../config'
import { err } from '../../lib/errors'
import { FetchClientEither } from '../../lib/http/fetch-client'
import { logger } from '../../lib/logging'
import {
  applyToSession,
  applyToSession2,
  decodeJson,
  filterStatus,
  ResponseWithSession,
  returnDecoded,
  returnS,
  withResponse,
} from '../drive/requests/filterStatus'
import { ICloudSession } from '../session/session'
import { applyCookiesToSession, buildRequest } from '../session/session-http'
import { AccountLoginResponseBody } from './types'

export function requestAccoutLogin(
  client: FetchClientEither,
  session: ICloudSession,
): TE.TaskEither<Error, ResponseWithSession<AccountLoginResponseBody>> {
  logger.debug('requestAccoutLogin')

  const applyResponse = flow(
    withResponse,
    filterStatus(),
    decodeJson(v => t.type({ appsOrder: t.unknown }).decode(v) as t.Validation<AccountLoginResponseBody>),
    applyToSession2(({ httpResponse }) => applyCookiesToSession(httpResponse)),
    returnDecoded(),
  )

  return pipe(
    session.sessionToken,
    TE.fromOption(() => err('session missing sessionToken')),
    TE.map((sessionToken) =>
      buildRequest(
        'POST',
        'https://setup.icloud.com/setup/ws/1/accountLogin',
        {
          addClientInfo: true,
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
    TE.map(applyResponse),
    TE.chain(apply(session)),
  )
}
