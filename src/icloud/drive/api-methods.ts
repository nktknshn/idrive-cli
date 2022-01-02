import { flow, pipe } from 'fp-ts/lib/function'
import { capDelay, exponentialBackoff, limitRetries, Monoid, RetryStatus } from 'retry-ts'
import { retrying } from 'retry-ts/Task'
import { ApiM, executeRequest, storeSessionAndReturnBody } from './api/apim'
import * as RQ from './requests'
import * as T from './requests/types/types'

export const retrieveItemDetailsInFolders = (drivewsids: string[]): ApiM<(T.Details | T.InvalidId)[]> => {
  return pipe(
    executeRequest(RQ.retrieveItemDetailsInFolders)({ drivewsids }),
    storeSessionAndReturnBody(),
  )
}

export const renameItems = (items: {
  drivewsid: string
  etag: string
  name: string
  extension?: string
}[]): ApiM<RQ.RenameResponse> => {
  return pipe(
    executeRequest(RQ.renameItems)({ items }),
    storeSessionAndReturnBody(),
  )
}
