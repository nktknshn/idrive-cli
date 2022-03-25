import { fetchClient, FetchError } from './lib/http/fetch-client'
import { input } from './lib/input'

export const defaultApiEnv = {
  catchFetchErrorsRetries: 3,
  catchSessErrors: true,
  catchFetchErrors: true,
  catchFetchErrorsRetryDelay: 200,
  isFetchError: FetchError.is,
  fetchClient,
  getCode: () => input({ prompt: 'code: ' }),
}

export const defaultFileEditor = 'vim'
export const defaultTempDir = '/tmp/'
