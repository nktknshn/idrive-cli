import { flow, pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { EmptyObject } from '../../util/types'
import { BaseState } from '.'
import { CatchFetchEnv, catchFetchErrorsSRTE } from './catch-fetch-error'
import { ReqWrapper } from './lib/request-wrapper'

export const wrapBasicReq: ReqWrapper<
  CatchFetchEnv,
  BaseState,
  EmptyObject
> = (deps) =>
  flow(
    catchFetchErrorsSRTE(deps),
    SRTE.local(() => deps),
  )
