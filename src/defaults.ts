import { ClientInfo } from './icloud/session/types'
import { fetchClient, FetchError } from './util/http/fetch-client'
import { input } from './util/prompts'

export const defaultApiEnv = {
  catchFetchErrorsRetries: 3,
  catchSessErrors: true,
  catchFetchErrors: true,
  catchFetchErrorsRetryDelay: 200,
  isFetchError: FetchError.is,
  fetchClient,
  getCode: () => input({ message: 'code: ' }),
}

export const defaultFileEditor = 'vim'
export const defaultTempDir = '/tmp/'
export const defaultSessionFile = 'data/last-session.json'
export const defaultCacheFile = 'data/cli-drive-cache.json'

export const defaultDownloadChunkSize = 5

export const defaultCountryCode = 'RUS'
export const defaultClientInfo: ClientInfo = {
  appIdentifier: 'iclouddrive',
  reqIdentifier: '9d4788f6-fc48-47e1-8d38-13c46d8d85db',
  clientBuildNumber: '2116Project37',
  clientMasteringNumber: '2116B28',
  clientId: 'f4058d20-0430-4cd5-bb85-7eb9b47fc94e',
}
