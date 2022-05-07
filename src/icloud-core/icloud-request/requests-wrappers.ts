import { hole } from 'fp-ts/lib/function'
import { flow, pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Reader'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { authorizeSession } from '../../icloud-authorization'
import { RQ } from '../../icloud-drive/drive'
import { EmptyObject } from '../../util/types'
import { AuthorizedState, BasicState } from '.'
import { CatchFetchEnv, catchFetchErrorsSRTE } from './catch-fetch-error'
import { CatchSessEnv, catchSessErrorsSRTE } from './catch-invalid-global-session'
import { ReqWrapper } from './lib/request-wrapper'

export const wrapBasicReq: ReqWrapper<
  CatchFetchEnv,
  BasicState,
  EmptyObject
> = (deps) =>
  flow(
    catchFetchErrorsSRTE(deps),
    SRTE.local(() => deps),
  )

export const wrapAuthorizedReq: ReqWrapper<
  CatchFetchEnv & CatchSessEnv,
  AuthorizedState,
  EmptyObject
> = deps =>
  flow(
    catchFetchErrorsSRTE(deps),
    // wrapBasicReq(deps),
    // SRTE.local(() => ({ ...deps, fetchClient: failingFetch(90) })),
    catchSessErrorsSRTE(deps),
    SRTE.local(() => deps),
  )

const attachDeps = <S, R, A>(
  m: SRTE.StateReaderTaskEither<S, R, Error, A>,
): (deps: R) => SRTE.StateReaderTaskEither<S, EmptyObject, Error, A> =>
  (deps: R) =>
    pipe(
      m,
      SRTE.local<EmptyObject, R>(() => deps),
    )

const flipcurry = <
  Arg1 extends unknown[],
  Arg2 extends unknown[],
  A,
>(
  f: (...a: Arg1) => (...b: Arg2) => A,
): (...b: Arg2) => (...a: Arg1) => A => {
  return (...b) => (...a) => f(...a)(...b)
}
const flipcurry2 = <
  Arg1 extends unknown[],
  Arg2,
  A,
>(
  f: (...a: Arg1) => (b: Arg2) => A,
): (b: Arg2) => (...a: Arg1) => A => {
  return (b) => (...a) => f(...a)(b)
}
const flipcurry3 = <
  Arg1,
  Arg2,
  A,
>(
  f: (a: Arg1) => (b: Arg2) => A,
): (b: Arg2) => (a: Arg1) => A => {
  return (b) => (a) => f(a)(b)
}

const f = flow(
  RQ.createFolders,
  attachDeps,
)

const fff = flipcurry3(f)

const bbb = flow(
  fff,
  a => a,
  // R.chainW(f => pipe(catchFetchErrorsSRTE, R.map(s => flow(f, s)))),
)

// const attachDeps = <Args extends unknown[], A, R>(
//   m: <S extends any>(...args: Args) => SRTE.StateReaderTaskEither<S, R, Error, A>,
// ) =>
//   (deps: R) =>
//     flow(
//       m,
//       SRTE.local<EmptyObject, R>(() => deps),
//     )
