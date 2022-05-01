export * from './methods/extension'
export * from './methods/standard'
export * from './methods/upload'
// export * as DriveApi from './drive-api'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'

import * as DriveApi from './drive-api'

type A = typeof DriveApi
export type DepApi<K extends keyof A> = A[K] extends
  (...args: any) => SRTE.StateReaderTaskEither<any, infer Deps, Error, any> ? Deps
  : never
