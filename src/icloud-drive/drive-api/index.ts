import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'

import * as basic from './basic'
import * as extra from './extra'
import * as upload from './upload'

export const DriveApiMethods = { ...basic, ...extra, ...upload }

/** Pick dependings for a method */
export type DepApiMethod<K extends keyof typeof DriveApiMethods> = typeof DriveApiMethods[K] extends
  (...args: never) => SRTE.StateReaderTaskEither<infer _S, infer R, infer _E, infer _A> ? R : never
