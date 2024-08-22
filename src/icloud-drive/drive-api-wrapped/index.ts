import { sequenceS } from 'fp-ts/lib/Apply'
import { flow } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as R from 'fp-ts/Reader'
import { AuthenticatedState, RequestDeps } from '../../icloud-core/icloud-request'
import { CatchFetchDeps, catchFetchErrorsSRTE } from '../../icloud-core/icloud-request/catch-fetch-error'
import { CatchSessDeps, catchSessErrorsSRTE } from '../../icloud-core/icloud-request/catch-invalid-global-session'
import { InvalidResponseStatusError } from '../../util/errors'
import { SRTEWrapper, wrapSRTERecord } from '../../util/srte-wrapper'
import { EmptyObject } from '../../util/types'
import * as RQ from '../drive-requests'
import { DriveApiWrapped } from './type'
export { type DriveApiWrapped } from './type'

const seqs = sequenceS(R.Apply)

/** Wrapper to catch  */
const wrapAuthenticatedReq: SRTEWrapper<
  CatchFetchDeps & CatchSessDeps,
  AuthenticatedState,
  EmptyObject
> = deps =>
  flow(
    catchFetchErrorsSRTE(deps),
    catchSessErrorsSRTE(deps),
    SRTE.local(() => deps),
  )

/** Separate wrapper for 409 error that might happen while uploading documents */
const wrapHandle409: SRTEWrapper<
  CatchFetchDeps & CatchSessDeps,
  AuthenticatedState,
  EmptyObject
> = (deps) =>
  flow(
    wrapAuthenticatedReq(deps),
    catchFetchErrorsSRTE({
      catchFetchErrors: true,
      catchFetchErrorsRetries: 5,
      catchFetchErrorsRetryDelay: 400,
      isFetchError: e => InvalidResponseStatusError.is(e) && e.httpResponse.status == 409,
    }),
    SRTE.local(() => deps),
  )

/** Wrap with error handlers and inject dependencies into api requests */
export const createWrappedDriveApi: R.Reader<
  CatchFetchDeps & CatchSessDeps & RequestDeps,
  DriveApiWrapped
> = seqs(
  {
    ...wrapSRTERecord(RQ)(wrapAuthenticatedReq),
    ...wrapSRTERecord({ updateDocuments: RQ.updateDocuments })(wrapHandle409),
  },
)
