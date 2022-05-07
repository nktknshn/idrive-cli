import { authorizeSession as authorizeSession_ } from '../icloud-authorization'
import { wrapRequest } from '../icloud-core/icloud-request/lib/request-wrapper'
import { wrapBasicReq } from '../icloud-core/icloud-request/requests-wrappers'

export const authorizeSession = wrapRequest(
  wrapBasicReq,
)(authorizeSession_)
