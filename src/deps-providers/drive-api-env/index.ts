import { sequenceS } from 'fp-ts/lib/Apply'
import { flow } from 'fp-ts/lib/function'
import * as R from 'fp-ts/Reader'
import { AuthorizedState, RequestEnv } from '../../icloud-core/icloud-request'
import { CatchFetchEnv, catchFetchErrorsSRTE } from '../../icloud-core/icloud-request/catch-fetch-error'
import { CatchSessEnv } from '../../icloud-core/icloud-request/catch-invalid-global-session'
import { ReqWrapper, wrapRequests } from '../../icloud-core/icloud-request/lib/request-wrapper'
import { wrapAuthorizedReq } from '../../icloud-core/icloud-request/requests-wrappers'
import { RQ } from '../../icloud-drive/drive'
import { DriveApiEnv } from '../../icloud-drive/drive/drive-api/deps/dep-drive-api-env'
import { InvalidResponseStatusError } from '../../util/errors'
import { EmptyObject } from '../../util/types'

const seqs = sequenceS(R.Apply)

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
    // SRTE.local(() => ({ ...deps, fetchClient: failingFetch(90) })),
  )

// const defaultDriveApiEnvSchema = {
//   ...wrapRequests(RQ)(wrapAuthorizedReq),
//   ...wrapRequests({ updateDocuments: RQ.updateDocuments })(handle409),
// }

export const createDriveApiEnv: R.Reader<
  CatchFetchEnv & CatchSessEnv & RequestEnv,
  DriveApiEnv
> = seqs(
  {
    ...wrapRequests(RQ)(wrapAuthorizedReq),
    ...wrapRequests({ updateDocuments: RQ.updateDocuments })(handle409),
  },
)
