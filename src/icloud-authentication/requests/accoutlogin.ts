import { flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'

import * as t from 'io-ts'
import { countryCode } from '../../defaults'
import * as AR from '../../icloud-core/icloud-request'
import { logAPI } from '../../icloud-core/icloud-request/log'
import { err } from '../../util/errors'
import { type AccountData } from '../type-accountdata'

export function requestAccoutLogin<S extends AR.BaseState>(): AR.ApiRequest<AccountData, S> {
  return pipe(
    AR.readStateAndDeps<S>(),
    SRTE.chainW(({ state }) => SRTE.fromOption(() => err(`session missing sessionToken`))(state.session.sessionToken)),
    SRTE.chainW(sessionToken =>
      pipe(
        AR.buildRequest<S>((
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
                O.getOrElse(() => countryCode),
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
    logAPI('requestAccoutLogin'),
  )
}
