import { isRight } from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as t from 'io-ts'
import { err, InvalidGlobalSessionError } from '../../../util/errors'
import * as AR from '../../request/request'
import { ICloudSessionWithSessionToken } from '../../session/session-type'
import { AccountData } from './../types'

const decode = (v: unknown) => t.type({ dsInfo: t.unknown }).decode(v) as t.Validation<AccountData>

export const validateResponseJson = (json: unknown): json is AccountData => isRight(decode(json))

// export type AccountLoginResponseBodyUnsafe = Partial<AccountLoginResponseBody>

export function validateSessionM(): AR.ApiRequest<O.Option<AccountData>, {
  session: ICloudSessionWithSessionToken
}> {
  return pipe(
    AR.buildRequestC<{ session: ICloudSessionWithSessionToken }, AR.RequestEnv>(() => ({
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
  )
}
