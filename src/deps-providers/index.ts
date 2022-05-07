import { AuthorizeEnv } from '../icloud-authorization'
import { RequestEnv } from '../icloud-core/icloud-request'
import { CatchFetchEnv } from '../icloud-core/icloud-request/catch-fetch-error'
import { CatchSessEnv } from '../icloud-core/icloud-request/catch-invalid-global-session'
import { authorizeSession as authorizeSession_ } from './authorize-session'
import { createDriveApiEnv } from './drive-api-env'
import { fetchClient, FetchError } from './fetchclient'
import { getCode } from './getCode'
export { askConfirmation } from './askConfirmation'
export { fs } from './fs'
export { fetchClient }

const requestEnv: RequestEnv = {
  fetchClient,
}

const catchFetchEnv: CatchFetchEnv = {
  catchFetchErrorsRetries: 3,
  catchFetchErrors: true,
  catchFetchErrorsRetryDelay: 200,
  isFetchError: FetchError.is,
}

const authorizeEnv: AuthorizeEnv = {
  getCode,
  ...requestEnv,
}

export const authorizeSession = authorizeSession_({
  ...catchFetchEnv,
  ...authorizeEnv,
})

const catchSessEnv: CatchSessEnv = {
  catchSessErrors: true,
  authorizeSession,
}

const apiEnv = {
  ...requestEnv,
  ...catchFetchEnv,
  ...catchSessEnv,
}

export const api = createDriveApiEnv(apiEnv)
