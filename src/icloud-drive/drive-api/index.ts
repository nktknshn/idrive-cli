import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { DriveApiWrapped } from '../drive-api-wrapped'

import * as basic from './basic'
import * as extra from './extra'
import * as upload from './upload'

export const DriveApiMethods = { ...basic, ...extra, ...upload }

/** Pick dependings for a method */
export type DepApiMethod<K extends keyof typeof DriveApiMethods> = typeof DriveApiMethods[K] extends
  (...args: any) => SRTE.StateReaderTaskEither<any, infer R, any, any> ? R : never
