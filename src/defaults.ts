import { fetchClient } from './lib/http/fetch-client'
import { input } from './lib/input'
import { askConfirmation } from './lib/prompts'

export const defaultApiEnv = {
  retries: 3,
  fetchClient,
  getCode: () => input({ prompt: 'code: ' }),
  catchSessErrors: true,
  catchFetchErrors: true,
  retryDelay: 200,
  askConfirmation,
  tempdir: `/tmp/`,
}
