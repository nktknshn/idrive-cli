import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { EmptyObject, SRA } from './types'

/**
 * Wraps an SRTE with a wrapper, returning a function that takes a combination of their dependencies.
 * The returned function takes those dependencies and returns an SRTE without dependencies (they are injected).
 */
export const wrapSRTE = <WR, WRS, RR>(wrapper: SRTEWrapper<WR, WRS, RR>) =>
  <Args extends unknown[], A, R extends EmptyObject>(
    req: <S extends WRS>(...args: Args) => SRTE.StateReaderTaskEither<S, R, Error, A>,
  ) =>
    (deps: WR & R): <S extends WRS>(...args: Args) => SRA<S, EmptyObject extends RR ? EmptyObject : (RR & R), A> =>
      <S extends WRS>(...args: Args) => {
        const w = wrapper(deps)
        return pipe(
          w(req<S>(...args)),
        )
      }

/** Wraps multiple SRTEs with a wrapper */
export const wrapSRTERecord = <
  Rec extends Record<string, (...args: any[]) => SRTE.StateReaderTaskEither<any, any, any, any>>,
>(
  reqs: Rec,
) =>
  <WR, WRS, WRR>(wrapper: SRTEWrapper<WR, WRS, WRR>): {
    [K in keyof Rec]: Rec[K] extends
      (...args: infer Args) => SRTE.StateReaderTaskEither<infer _S, infer _R, infer E, infer A>
      ? (deps: _R & WR) => <S extends _S>(...args: Args) => SRA<S, WRR, A>
      : never
  } => {
    const r: any = {}

    for (const k of Object.keys(reqs)) {
      r[k] = wrapSRTE(wrapper)(reqs[k])
    }

    return r
  }

/** Wraps SRTE */
export type SRTEWrapper<WR, SS, RR = WR> = <R extends EmptyObject>(r: R & WR) => <A, S extends SS>(
  req: SRTE.StateReaderTaskEither<S, R, Error, A>,
) => SRTE.StateReaderTaskEither<
  S,
  EmptyObject extends RR ? EmptyObject : (RR & R),
  Error,
  A
>
