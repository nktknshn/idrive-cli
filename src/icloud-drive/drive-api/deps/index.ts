import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { DriveApiEnv } from '../../drive-api-env/dep-drive-api-env'

export type GetDep<
  K extends keyof DriveApiEnv,
  RootKey extends string | number | symbol = 'api',
> = Record<
  RootKey,
  Pick<DriveApiEnv, K>
>

export const useApi = <Args extends unknown[], S, R, A>(
  f: (r: R) => (...args: Args) => SRTE.StateReaderTaskEither<S, R, Error, A>,
) =>
  (...args: Args) =>
    pipe(
      SRTE.ask<S, R>(),
      SRTE.map(f),
      SRTE.chain(f => f(...args)),
    )
