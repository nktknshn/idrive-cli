import { isRight } from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as t from 'io-ts'
import * as AR from '../../icloud-core/icloud-request/lib/request'
import { ICloudSessionWithSessionToken } from '../../icloud-core/session/session-type'
import { apiLoggerIO } from '../../logging/loggerIO'
import { InvalidGlobalSessionError } from '../../util/errors'
import { runLogging } from '../../util/srte-utils'
import { type AccountData } from '../type-accountdata'

const decode = (v: unknown) => t.type({ dsInfo: t.unknown }).decode(v) as t.Validation<AccountData>

export const validateResponseJson = (json: unknown): json is AccountData => isRight(decode(json))

export function validateSession(): AR.ApiRequest<O.Option<AccountData>, {
  session: ICloudSessionWithSessionToken
}> {
  return pipe(
    AR.buildRequest<{ session: ICloudSessionWithSessionToken }, AR.RequestDeps>(() => ({
      method: 'POST',
      url: 'https://setup.icloud.com/setup/ws/1/validate',
      options: { addClientInfo: true },
    })),
    AR.handleResponse(AR.basicJsonResponse(
      v => t.type({ dsInfo: t.unknown }).decode(v) as t.Validation<AccountData>,
    )),
    AR.map(O.some),
    AR.orElse((e) =>
      InvalidGlobalSessionError.is(e)
        ? AR.of(O.none)
        : SRTE.left(e)
    ),
    runLogging(apiLoggerIO.debug('validateSession')),
  )
}
