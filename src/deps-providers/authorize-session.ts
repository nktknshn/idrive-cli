import { sequenceS } from 'fp-ts/lib/Apply'
import * as R from 'fp-ts/Reader'
import { authorizeSession as authorizeSession_ } from '../icloud/authorization'
import { wrapRequests } from '../icloud/request/request-wrapper'
import { wrapBasicReq } from './drive-api-env'

const seqs = sequenceS(R.Apply)

export const authorizeSessionMethod = seqs(
  wrapRequests({ authorizeSession: authorizeSession_ })(
    wrapBasicReq,
  ),
)
