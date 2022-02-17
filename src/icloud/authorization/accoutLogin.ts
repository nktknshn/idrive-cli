import { flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as t from 'io-ts'
import { defaultCountryCode } from '../../config'
import { err } from '../../lib/errors'
import { logger } from '../../lib/logging'
import * as AR from '../drive/requests/request'
import { AccountLoginResponseBody } from './types'

export function requestAccoutLoginM<S extends AR.State>(): AR.ApiRequest<
  AccountLoginResponseBody,
  S
> {
  logger.debug('requestAccoutLogin')

  return pipe(
    AR.readEnv<S>(),
    AR.chain(({ state }) =>
      pipe(
        state.session.sessionToken,
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
