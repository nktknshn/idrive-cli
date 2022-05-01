import { sequenceS } from 'fp-ts/lib/Apply'
import { flow } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as R from 'fp-ts/Reader'
import { InvalidResponseStatusError } from '../../../util/errors'
import { AuthorizeEnv, authorizeSession } from '../../authorization/authorization-methods'
import { CatchFetchEnv, catchFetchErrorsSRTE, CatchSessEnv, catchSessErrorsSRTE } from '../../request/api-catch'
import { AuthorizedState, BasicState } from '../../request/request'
import { ReqWrapper, wrapRequest, wrapRequests } from '../../request/request-wrapper'
import * as RQ from '../requests'
import { DriveApi } from './drive-api-type'

const seqs = sequenceS(R.Apply)

export type ApiCreator<Env> = R.Reader<Env, DriveApi>

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
  // ...wrapRequests({ authorizeSession })(basic),
}

export const defaultApiCreator: ApiCreator<CatchFetchEnv & CatchSessEnv & AuthorizeEnv> = seqs(
  defaultApiSchema,
)
