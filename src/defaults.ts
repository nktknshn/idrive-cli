import { defaultApiCreator } from './deps-providers/drive-api-env'
import { ClientInfo } from './icloud/session/types'
import { fetchClient, FetchError } from './util/http/fetch-client'
import { input } from './util/prompts'
export * as fs from './util/fs'
export { askConfirmation } from './util/prompts'

export const apiEnv = {
  catchFetchErrorsRetries: 3,
  catchSessErrors: true,
  catchFetchErrors: true,
  catchFetchErrorsRetryDelay: 200,
  isFetchError: FetchError.is,
  fetchClient,
  getCode: () => input({ message: 'code: ' }),
}

export const fileEditor = 'vim'
export const tempDir = '/tmp/'
export const sessionFile = 'data/last-session.json'
export const cacheFile = 'data/cli-drive-cache.json'

export const downloadChunkSize = 5

export const countryCode = 'RUS'
export const clientInfo: ClientInfo = {
  appIdentifier: 'iclouddrive',
  reqIdentifier: '9d4788f6-fc48-47e1-8d38-13c46d8d85db',
  clientBuildNumber: '2116Project37',
  clientMasteringNumber: '2116B28',
  clientId: 'f4058d20-0430-4cd5-bb85-7eb9b47fc94e',
}

export const api = defaultApiCreator(apiEnv)

// export const fs =
