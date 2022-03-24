import { sequenceS } from 'fp-ts/lib/Apply'
import { flow, pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as R from 'fp-ts/Reader'
import { XX } from '../../../lib/types'
import { AuthorizedState, AuthorizeEnv, authorizeSession } from '../../authorization/authorize'
import * as RQ from '../requests'
import { BasicState } from '../requests/request'
import { CatchFetchEnv, catchFetchErrorsSRTE, CatchSessEnv, catchSessErrorsSRTE } from './api-catch'
import { ReqWrapper, wrapRequest, wrapRequests } from './wrapper'
const seqs = sequenceS(R.Apply)

export const defaultWrapper: ReqWrapper<
  CatchFetchEnv & CatchSessEnv & AuthorizeEnv,
  AuthorizedState
> = (deps) =>
  flow(
    SRTE.local(() => deps),
    catchFetchErrorsSRTE(deps),
    catchSessErrorsSRTE(deps),
  )

export const anothjer: ReqWrapper<CatchFetchEnv & AuthorizeEnv, BasicState> = (deps) =>
  flow(
    SRTE.local(() => deps),
    catchFetchErrorsSRTE(deps),
  )

export const anothjer2: ReqWrapper<
  CatchFetchEnv & AuthorizeEnv & { logenabled: boolean },
  BasicState
> = (deps) =>
  flow(
    SRTE.local(() => deps),
    catchFetchErrorsSRTE(deps),
  )

export const apiCreator = seqs(
  {
    ...wrapRequests(RQ)(defaultWrapper),
    authorizeSession: wrapRequest(anothjer)(authorizeSession),
  },
)

// const b2 = pipe(
//   apiCreator,
//   R.bindTo('api'),
//   R.bindW('authorizeSession', ({ api }) =>
//     flow(
//       api.authorizeSession,
//     )),
//   R.map(({ api, authorizeSession }) => ({ ...api, authorizeSession })),
// )
