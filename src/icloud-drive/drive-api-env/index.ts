import { sequenceS } from 'fp-ts/lib/Apply'
import { flow } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as R from 'fp-ts/Reader'
import { AuthorizedState, RequestDeps } from '../../icloud-core/icloud-request'
import { CatchFetchDeps, catchFetchErrorsSRTE } from '../../icloud-core/icloud-request/catch-fetch-error'
import { CatchSessDeps, catchSessErrorsSRTE } from '../../icloud-core/icloud-request/catch-invalid-global-session'
import { InvalidResponseStatusError } from '../../util/errors'
import { SRTEWrapper, wrapSRTERecord } from '../../util/srte-wrapper'
import { EmptyObject } from '../../util/types'
import { RQ } from '..'
import { DriveApiEnv } from './dep-drive-api-env'

const seqs = sequenceS(R.Apply)

const wrapAuthorizedReq: SRTEWrapper<
  CatchFetchDeps & CatchSessDeps,
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

const handle409: SRTEWrapper<
  CatchFetchDeps & CatchSessDeps,
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
  CatchFetchDeps & CatchSessDeps & RequestDeps,
  DriveApiEnv
> = seqs(
  {
    ...wrapSRTERecord(RQ)(wrapAuthorizedReq),
    ...wrapSRTERecord({ updateDocuments: RQ.updateDocuments })(handle409),
  },
)
