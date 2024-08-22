import { AuthenticateDeps } from '../icloud-authentication'
import { RequestDeps } from '../icloud-core/icloud-request'
import { CatchFetchDeps } from '../icloud-core/icloud-request/catch-fetch-error'
import { CatchSessDeps } from '../icloud-core/icloud-request/catch-invalid-global-session'
import { createWrappedDriveApi } from '../icloud-drive/drive-api-wrapped'
import { wrappedAuthenticateSession } from './authenticate-session'
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

const authenticateDeps: AuthenticateDeps = {
  getCode,
  ...requestDeps,
}

export const authenticateSession = wrappedAuthenticateSession({
  ...catchFetchDeps,
  ...authenticateDeps,
})

const catchSessDeps: CatchSessDeps = {
  catchSessErrors: true,
  authenticateSession: authenticateSession,
}

const apiDeps = {
  ...requestDeps,
  ...catchFetchDeps,
  ...catchSessDeps,
}

export const api = createWrappedDriveApi(apiDeps)
