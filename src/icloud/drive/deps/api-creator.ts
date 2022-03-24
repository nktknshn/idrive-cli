import { sequenceS } from 'fp-ts/lib/Apply'
import { flow } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as R from 'fp-ts/Reader'
import { AuthorizedState, AuthorizeEnv, authorizeSession } from '../../authorization/authorize'
import * as RQ from '../requests'
import { BasicState } from '../requests/request'
import { CatchFetchEnv, catchFetchErrorsSRTE, CatchSessEnv, catchSessErrorsSRTE } from './api-catch'
import { ReqWrapper, wrapRequests } from './wrapper'
const seqs = sequenceS(R.Apply)

export const authorized: ReqWrapper<
  CatchFetchEnv & CatchSessEnv & AuthorizeEnv,
  AuthorizedState
> = (deps) =>
  flow(
    basic(deps),
    catchSessErrorsSRTE(deps),
  )

export const basic: ReqWrapper<
  CatchFetchEnv & AuthorizeEnv,
  BasicState
> = (deps) =>
  flow(
    SRTE.local(() => deps),
    catchFetchErrorsSRTE(deps),
  )

export const apiCreator = seqs(
  {
    ...wrapRequests(RQ)(authorized),
    ...wrapRequests({ authorizeSession })(basic),
  },
)
