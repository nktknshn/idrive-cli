import { sequenceS } from 'fp-ts/lib/Apply'
import { flow } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as R from 'fp-ts/Reader'
import { AuthorizedState, RequestEnv } from '../../icloud-core/icloud-request'
import { CatchFetchEnv, catchFetchErrorsSRTE } from '../../icloud-core/icloud-request/catch-fetch-error'
import { CatchSessEnv, catchSessErrorsSRTE } from '../../icloud-core/icloud-request/catch-invalid-global-session'
import { ReqWrapper, wrapRequests } from '../../icloud-core/icloud-request/lib/request-wrapper'
import { InvalidResponseStatusError } from '../../util/errors'
import { EmptyObject } from '../../util/types'
import { RQ } from '..'
import { DriveApiEnv } from './dep-drive-api-env'

const seqs = sequenceS(R.Apply)

const wrapAuthorizedReq: ReqWrapper<
  CatchFetchEnv & CatchSessEnv,
  AuthorizedState,
  EmptyObject
> = deps =>
  flow(
    catchFetchErrorsSRTE(deps),
    // wrapBasicReq(deps),
    // SRTE.local(() => ({ ...deps, fetchClient: failingFetch(90) })),
    catchSessErrorsSRTE(deps),
    SRTE.local(() => deps),
  )

const handle409: ReqWrapper<
  CatchFetchEnv & CatchSessEnv,
  AuthorizedState,
  EmptyObject
> = (deps) =>
  flow(
    wrapAuthorizedReq(deps),
    catchFetchErrorsSRTE({
      catchFetchErrors: true,
      catchFetchErrorsRetries: 5,
      catchFetchErrorsRetryDelay: 100,
      isFetchError: e => InvalidResponseStatusError.is(e) && e.httpResponse.status == 409,
    }),
    SRTE.local(() => deps),
    // SRTE.local(() => ({ ...deps, fetchClient: failingFetch(90) })),
  )

export const createDriveApiEnv: R.Reader<
  CatchFetchEnv & CatchSessEnv & RequestEnv,
  DriveApiEnv
> = seqs(
  {
    ...wrapRequests(RQ)(wrapAuthorizedReq),
    ...wrapRequests({ updateDocuments: RQ.updateDocuments })(handle409),
  },
)
