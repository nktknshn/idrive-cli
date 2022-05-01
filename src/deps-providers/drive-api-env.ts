import { sequenceS } from 'fp-ts/lib/Apply'
import { flow } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as R from 'fp-ts/Reader'
import { DriveApiEnv } from '../deps/dep-drive-api-env'
import { AuthorizeEnv } from '../icloud/authorization/authorize-session'
import * as RQ from '../icloud/drive/icloud-drive-requests'
import { AuthorizedState, BasicState } from '../icloud/request'
import { CatchFetchEnv, catchFetchErrorsSRTE, CatchSessEnv, catchSessErrorsSRTE } from '../icloud/request/catch'
import { ReqWrapper, wrapRequests } from '../icloud/request/request-wrapper'
import { InvalidResponseStatusError } from '../util/errors'

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
