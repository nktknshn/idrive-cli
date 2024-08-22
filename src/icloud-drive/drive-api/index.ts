import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { DriveApiWrapped } from '../drive-api-wrapped'

import * as basic from './basic'
import * as extra from './extra'
import * as upload from './upload'

export const DriveApiMethods = { ...basic, ...extra, ...upload }

/** Pick dependings for a method */
export type DepApiMethod<K extends keyof typeof DriveApiMethods> = typeof DriveApiMethods[K] extends
  (...args: any) => SRTE.StateReaderTaskEither<any, infer R, any, any> ? R : never

/** Pick a method from DriveApiWrapped */
export type PickDriveApiWrappedMethod<
  K extends keyof DriveApiWrapped,
  RootKey extends string | number | symbol = 'api',
> = Record<
  RootKey,
  Pick<DriveApiWrapped, K>
>

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
