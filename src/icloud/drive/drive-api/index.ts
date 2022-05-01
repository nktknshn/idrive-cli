import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'

import * as DriveApi from './drive-api'
export * from './drive-api'

type A = typeof DriveApi
export type DepApi<K extends keyof A> = A[K] extends
  (...args: any) => SRTE.StateReaderTaskEither<any, infer Deps, Error, any> ? Deps
  : never
