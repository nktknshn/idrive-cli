import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { XX } from '../../../lib/types'

export const wrapRequest = <WR, WRS>(wrapper: ReqWrapper<WR, WRS>) =>
  <Args extends unknown[], A, R>(
    req: <S extends WRS>(...args: Args) => SRTE.StateReaderTaskEither<S, R, Error, A>,
  ) =>
    (deps: WR & R): <S extends WRS>(...args: Args) => XX<S, A> =>
      <S extends WRS>(...args: Args) =>
        pipe(
          req<S>(...args),
          wrapper(deps),
        )

export const wrapRequests = <
  Rec extends Record<string, (...args: any[]) => SRTE.StateReaderTaskEither<any, any, any, any>>,
>(
  reqs: Rec,
) =>
  <WR, WRS, WRR>(wrapper: ReqWrapper<WR, WRS, WRR>): {
    [K in keyof Rec]: Rec[K] extends
      (...args: infer Args) => SRTE.StateReaderTaskEither<infer _S, infer R, infer E, infer A>
      ? R extends WRR ? (deps: R & WR) => <S extends _S>(...args: Args) => XX<S, A>
      : never
      : never
  } => {
    let r: any = {}

    for (const k of Object.keys(reqs)) {
      r[k] = wrapRequest(wrapper)(reqs[k])
    }

    return r
  }

export type ReqWrapper<WR, SS, RR = any> = <R extends RR>(r: R & WR) => <A, S extends SS>(
  req: SRTE.StateReaderTaskEither<S, R, Error, A>,
) => SRTE.StateReaderTaskEither<S, {}, Error, A>
