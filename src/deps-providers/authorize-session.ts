import { flow } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { authorizeSession as authorizeSession_ } from '../icloud-authorization'
import { BaseState } from '../icloud-core/icloud-request'
import { CatchFetchDeps, catchFetchErrorsSRTE } from '../icloud-core/icloud-request/catch-fetch-error'
import { SRTEWrapper, wrapSRTE } from '../util/srte-wrapper'
import { EmptyObject } from '../util/types'

/** Catch fetch errors and retry */
const catchFetchWrapper: SRTEWrapper<
  CatchFetchDeps,
  BaseState,
  EmptyObject
> = (deps) =>
  flow(
    catchFetchErrorsSRTE(deps),
    SRTE.local(() => deps),
  )

export const wrappedAuthorizeSession = wrapSRTE(
  catchFetchWrapper,
)(authorizeSession_)
