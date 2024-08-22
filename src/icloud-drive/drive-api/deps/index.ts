import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { DriveApi } from '../../drive-api-dep/type'

export type DepApi<
  K extends keyof DriveApi,
  RootKey extends string | number | symbol = 'api',
> = Record<
  RootKey,
  Pick<DriveApi, K>
>

export const apiMethod = <Args extends unknown[], S, R, A>(
  f: (r: R) => (...args: Args) => SRTE.StateReaderTaskEither<S, R, Error, A>,
): (...args: Args) => SRTE.StateReaderTaskEither<S, R, Error, A> =>
  (...args: Args) =>
    pipe(
      SRTE.ask<S, R>(),
      SRTE.map(f),
      SRTE.chain(f => f(...args)),
    )
