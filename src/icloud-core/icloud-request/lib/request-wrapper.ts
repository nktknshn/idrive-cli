import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { EmptyObject, XX, XXX } from '../../../util/types'

export const wrapRequest = <WR, WRS, RR>(wrapper: ReqWrapper<WR, WRS, RR>) =>
  <Args extends unknown[], A, R extends EmptyObject>(
    req: <S extends WRS>(...args: Args) => SRTE.StateReaderTaskEither<S, R, Error, A>,
  ) =>
    (deps: WR & R): <S extends WRS>(...args: Args) => XXX<S, EmptyObject extends RR ? EmptyObject : (RR & R), A> =>
      <S extends WRS>(...args: Args) => {
        const w = wrapper(deps)
        return pipe(
          w(req<S>(...args)),
          // SRTE.local(() => deps),
        )
      }

export const wrapRequests = <
  Rec extends Record<string, (...args: any[]) => SRTE.StateReaderTaskEither<any, any, any, any>>,
>(
  reqs: Rec,
) =>
  <WR, WRS, WRR>(wrapper: ReqWrapper<WR, WRS, WRR>): {
    [K in keyof Rec]: Rec[K] extends
      (...args: infer Args) => SRTE.StateReaderTaskEither<infer _S, infer _R, infer E, infer A>
      ? (deps: _R & WR) => <S extends _S>(...args: Args) => XXX<S, WRR, A>
      : never
  } => {
    const r: any = {}

    for (const k of Object.keys(reqs)) {
      r[k] = wrapRequest(wrapper)(reqs[k])
    }

    return r
  }

export type ReqWrapper<WR, SS, RR = WR> = <R extends EmptyObject>(r: R & WR) => <A, S extends SS>(
  req: SRTE.StateReaderTaskEither<S, R, Error, A>,
) => SRTE.StateReaderTaskEither<
  S,
  EmptyObject extends RR ? EmptyObject : (RR & R),
  Error,
  A
>
