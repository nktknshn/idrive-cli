import { RequestDeps } from '../icloud-core/icloud-request'

import { fetchClient, FetchError } from '../util/http/fetch-client'
export { fetchClient, FetchError }

export const requestDeps: RequestDeps = { fetchClient }
