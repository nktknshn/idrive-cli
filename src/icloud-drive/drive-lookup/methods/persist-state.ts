import { constVoid, pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { Deps, Lookup } from '../drive-lookup'

export const persisState = <A>(ma: Lookup<A>): Lookup<A> =>
  pipe(
    ma,
    SRTE.chainFirst(() =>
      SRTE.asks(
        ({ hookPesistState }: Deps) => hookPesistState ?? SRTE.of(constVoid()),
      )
    ),
  )
