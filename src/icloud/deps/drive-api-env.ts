import { sequenceS } from 'fp-ts/lib/Apply'
import { flow } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as R from 'fp-ts/Reader'
import { InvalidResponseStatusError } from '../../util/errors'
import { AuthorizeEnv } from '../authorization/authorize-session'
import { DriveApiEnv } from '../drive/drive-api/deps/drive-api-env-type'
import * as RQ from '../drive/drive-api/requests'
import { CatchFetchEnv, catchFetchErrorsSRTE, CatchSessEnv, catchSessErrorsSRTE } from '../request/catch'
import { AuthorizedState, BasicState } from '../request/request'
import { ReqWrapper, wrapRequests } from '../request/request-wrapper'

const seqs = sequenceS(R.Apply)

export type ApiCreator<Env> = R.Reader<Env, DriveApiEnv>

export const wrapBasicReq: ReqWrapper<
  CatchFetchEnv & AuthorizeEnv,
  BasicState
> = (deps) =>
  flow(
    SRTE.local(() => deps),
    catchFetchErrorsSRTE(deps),
  )

export const wrapAuthorizedReq: ReqWrapper<
  CatchFetchEnv & CatchSessEnv & AuthorizeEnv,
  AuthorizedState
> = (deps) =>
  flow(
    wrapBasicReq(deps),
    // SRTE.local(() => ({ ...deps, fetchClient: failingFetch(90) })),
    catchSessErrorsSRTE(deps),
  )

export const handle409: ReqWrapper<
  CatchFetchEnv & CatchSessEnv & AuthorizeEnv,
  AuthorizedState
> = (deps) =>
  flow(
    wrapAuthorizedReq(deps),
    catchFetchErrorsSRTE({
      catchFetchErrors: true,
      catchFetchErrorsRetries: 5,
      catchFetchErrorsRetryDelay: 100,
      isFetchError: e => InvalidResponseStatusError.is(e) && e.httpResponse.status == 409,
    }),
    // SRTE.local(() => ({ ...deps, fetchClient: failingFetch(90) })),
  )

export const defaultDriveApiEnvSchema = {
  ...wrapRequests(RQ)(wrapAuthorizedReq),
  ...wrapRequests({ updateDocuments: RQ.updateDocuments })(handle409),
  // ...wrapRequests({ authorizeSession })(basic),
}

export const defaultApiCreator: ApiCreator<CatchFetchEnv & CatchSessEnv & AuthorizeEnv> = seqs(
  defaultDriveApiEnvSchema,
)
