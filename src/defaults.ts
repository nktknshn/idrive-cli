import { fetchClient } from './lib/http/fetch-client'
import { input } from './lib/input'

export const defaultApiEnv = {
  retries: 3,
  fetch: fetchClient,
  getCode: () => input({ prompt: 'code: ' }),
  catchSessErrors: true,
  catchFetchErrors: true,
  retryDelay: 200,
}

export const tempDir = `/tmp/`
