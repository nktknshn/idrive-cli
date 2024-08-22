import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { DriveApiWrapped } from '../drive-api-wrapped'

/** Create a method that depends on the api */
export const apiMethod = <Args extends unknown[], S, R, A>(
  f: (r: R) => (...args: Args) => SRTE.StateReaderTaskEither<S, R, Error, A>,
): (...args: Args) => SRTE.StateReaderTaskEither<S, R, Error, A> =>
  (...args: Args) =>
    pipe(
      SRTE.ask<S, R>(),
      SRTE.map(f),
      SRTE.chain(f => f(...args)),
    )

/** Pick a method from DriveApiWrapped into a `api` object */
export type PickDriveApiWrappedMethod<
  K extends keyof DriveApiWrapped,
  RootKey extends string | number | symbol = 'api',
> = Record<RootKey, Pick<DriveApiWrapped, K>>
