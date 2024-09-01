import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as t from 'io-ts'

import { AccountData } from '../../../icloud-authentication'
import { FetchClientEither, HttpResponse } from '../../../util/http/fetch-client'
import { ICloudSession } from '../../session/session-type'

/** Base state has only sesssion */
export type BaseState = {
  session: ICloudSession
}

/** AccountData is added after successful authentication */
export type AuthenticatedState = BaseState & {
  accountData: AccountData
}

/** fetchClient is the base dependency of this module */
export type RequestDeps = {
  fetchClient: FetchClientEither
}

/** API context */
export type ApiRequest<A, S, R = RequestDeps> = SRTE.StateReaderTaskEither<S, R, Error, A>

interface ValidHttpResponseBrand {
  readonly ValidHttpResponse: unique symbol
}

export type ValidHttpResponse<R extends { httpResponse: HttpResponse }> = t.Branded<R, ValidHttpResponseBrand>

export type Filter<S extends BaseState, R extends RequestDeps> = (
  ma: ApiRequest<{ httpResponse: HttpResponse }, S, R>,
) => ApiRequest<{ httpResponse: HttpResponse }, S, R>
