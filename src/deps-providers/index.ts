import { AuthorizeDeps } from '../icloud-authorization'
import { RequestDeps } from '../icloud-core/icloud-request'
import { CatchFetchEnv } from '../icloud-core/icloud-request/catch-fetch-error'
import { CatchSessEnv } from '../icloud-core/icloud-request/catch-invalid-global-session'
import { createDriveApiEnv } from '../icloud-drive/drive-api-env'
import { authorizeSession as authorizeSession_ } from './authorize-session'
import { fetchClient, FetchError } from './fetchclient'
import { getCode } from './get-code'
export { askConfirmation } from './ask-confirmation'
export { fs } from './fs'
export { fetchClient }

const requestEnv: RequestDeps = { fetchClient }

const catchFetchEnv: CatchFetchEnv = {
  catchFetchErrorsRetries: 3,
  catchFetchErrors: true,
  catchFetchErrorsRetryDelay: 200,
  isFetchError: FetchError.is,
}

const authorizeEnv: AuthorizeDeps = {
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
