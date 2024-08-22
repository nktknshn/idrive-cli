import { AuthorizeDeps } from '../icloud-authorization'
import { RequestDeps } from '../icloud-core/icloud-request'
import { CatchFetchDeps } from '../icloud-core/icloud-request/catch-fetch-error'
import { CatchSessDeps } from '../icloud-core/icloud-request/catch-invalid-global-session'
import { createDriveApiEnv } from '../icloud-drive/drive-api-dep'
import { wrappedAuthorizeSession } from './authorize-session'
import { fetchClient, FetchError } from './fetchclient'
import { getCode } from './get-code'
export { askConfirmation } from './ask-confirmation'
export { fs } from './fs'
export { fetchClient }

const requestDeps: RequestDeps = { fetchClient }

const catchFetchDeps: CatchFetchDeps = {
  catchFetchErrorsRetries: 3,
  catchFetchErrors: true,
  catchFetchErrorsRetryDelay: 200,
  isFetchError: FetchError.is,
}

const authorizeDeps: AuthorizeDeps = {
  getCode,
  ...requestDeps,
}

export const authorizeSession = wrappedAuthorizeSession({
  ...catchFetchDeps,
  ...authorizeDeps,
})

const catchSessDeps: CatchSessDeps = {
  catchSessErrors: true,
  authorizeSession,
}

const apiDeps = {
  ...requestDeps,
  ...catchFetchDeps,
  ...catchSessDeps,
}

export const api = createDriveApiEnv(apiDeps)
