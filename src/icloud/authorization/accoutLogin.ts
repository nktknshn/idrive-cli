import { apply, constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
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
  returnDecodedJson,
  returnS,
  withResponse,
} from '../drive/requests/http'
import * as AR from '../drive/requests/reader'
import { ICloudSession, ICloudSessionWithSessionToken } from '../session/session'
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
    returnDecodedJson(),
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

export function requestAccoutLoginM<S extends AR.State>(): AR.ApiSessionRequest<
  AccountLoginResponseBody,
  S
> {
  logger.debug('requestAccoutLogin')

  return pipe(
    AR.readEnv<S>(),
    AR.chain(_ =>
      pipe(
        _.state.session.sessionToken,
        AR.fromOption(() => err(`session missing sessionToken`)),
      )
    ),
    AR.chain(sessionToken =>
      pipe(
        AR.buildRequestC<S>((
          { state: { session } },
        ) => ({
          method: 'POST',
          url: `https://setup.icloud.com/setup/ws/1/accountLogin`,
          options: {
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
        })),
        AR.handleResponse(flow(
          AR.validateHttpResponse(),
          AR.decodeJson(v => t.type({ appsOrder: t.unknown }).decode(v) as t.Validation<AccountLoginResponseBody>),
          AR.applyCookies(),
          AR.map(_ => _.decoded),
        )),
      )
    ),
  )
}
