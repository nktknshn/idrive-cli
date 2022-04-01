import { flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as t from 'io-ts'
import { defaultCountryCode } from '../../defaults'
import { err } from '../../util/errors'
import { logger } from '../../util/logging'
import * as AR from '../drive/requests/request'
import { AccountData } from './types'

export function requestAccoutLoginM<S extends AR.BasicState>(): AR.ApiRequest<AccountData, S> {
  logger.debug('requestAccoutLogin')

  return pipe(
    AR.readEnv<S>(),
    SRTE.chainW(({ state }) =>
      pipe(
        AR.fromOption(() => err(`session missing sessionToken`))(state.session.sessionToken),
      )
    ),
    SRTE.chain(sessionToken =>
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
          AR.decodeJson(v => t.type({ appsOrder: t.unknown }).decode(v) as t.Validation<AccountData>),
          AR.applyCookies(),
          AR.map(_ => _.decoded),
        )),
      )
    ),
  )
}
