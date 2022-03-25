import { sequenceS } from 'fp-ts/lib/Apply'
import { flow } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as R from 'fp-ts/Reader'
import { InvalidResponseStatusError } from '../../../lib/errors'
import { AuthorizeEnv, authorizeSession } from '../../authorization/authorize'
import * as RQ from '../requests'
import { AuthorizedState, BasicState } from '../requests/request'
import { CatchFetchEnv, catchFetchErrorsSRTE, CatchSessEnv, catchSessErrorsSRTE } from './api-catch'
import { ApiType } from './api-type'
import { ReqWrapper, wrapRequests } from './request-wrapper'

const seqs = sequenceS(R.Apply)

export type ApiCreator<Env> = R.Reader<Env, ApiType>

export const basic: ReqWrapper<
  CatchFetchEnv & AuthorizeEnv,
  BasicState
> = (deps) =>
  flow(
    SRTE.local(() => deps),
    catchFetchErrorsSRTE(deps),
  )

export const authorized: ReqWrapper<
  CatchFetchEnv & CatchSessEnv & AuthorizeEnv,
  AuthorizedState
> = (deps) =>
  flow(
    basic(deps),
    // SRTE.local(() => ({ ...deps, fetchClient: failingFetch(90) })),
    catchSessErrorsSRTE(deps),
  )

export const handle409: ReqWrapper<
  CatchFetchEnv & CatchSessEnv & AuthorizeEnv,
  AuthorizedState
> = (deps) =>
  flow(
    authorized(deps),
    catchFetchErrorsSRTE({
      catchFetchErrors: true,
      catchFetchErrorsRetries: 5,
      catchFetchErrorsRetryDelay: 100,
      isFetchError: e => InvalidResponseStatusError.is(e) && e.httpResponse.status == 409,
    }),
    // SRTE.local(() => ({ ...deps, fetchClient: failingFetch(90) })),
  )

export const defaultApiSchema = {
  ...wrapRequests(RQ)(authorized),
  ...wrapRequests({ updateDocuments: RQ.updateDocuments })(handle409),
  ...wrapRequests({ authorizeSession })(basic),
} as const

export const defaultApiCreator: ApiCreator<CatchFetchEnv & CatchSessEnv & AuthorizeEnv> = seqs(
  defaultApiSchema,
)
