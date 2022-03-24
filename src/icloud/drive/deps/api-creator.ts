import { sequenceS } from 'fp-ts/lib/Apply'
import { flow } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as R from 'fp-ts/Reader'
import { AuthorizedState, AuthorizeEnv, authorizeSession } from '../../authorization/authorize'
import * as RQ from '../requests'
import { BasicState } from '../requests/request'
import { CatchFetchEnv, catchFetchErrorsSRTE, CatchSessEnv, catchSessErrorsSRTE } from './api-catch'
import { ApiType } from './api-type'
import { ReqWrapper, wrapRequests } from './request-wrapper'

const seqs = sequenceS(R.Apply)

export const basic: ReqWrapper<
  CatchFetchEnv & AuthorizeEnv,
  BasicState
> = (deps) =>
  flow(
    SRTE.local(() => deps),
    catchFetchErrorsSRTE(deps),
  )

export const authorized: ReqWrapper<
  CatchFetchEnv & CatchSessEnv & AuthorizeEnv,
  AuthorizedState
> = (deps) =>
  flow(
    basic(deps),
    catchSessErrorsSRTE(deps),
  )

export type ApiCreator<Env> = R.Reader<Env, ApiType>

export const apiCreator: ApiCreator<CatchFetchEnv & CatchSessEnv & AuthorizeEnv> = seqs(
  {
    ...wrapRequests(RQ)(authorized),
    ...wrapRequests({ authorizeSession })(basic),
  },
)
