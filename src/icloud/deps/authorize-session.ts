import { authorizeSession as authorizeSession_ } from '../authorization'
import { wrapRequest } from '../request/request-wrapper'
import { wrapBasicReq } from './drive-api-env'

export const authorizeSessionMethod = wrapRequest(wrapBasicReq)(authorizeSession_)
