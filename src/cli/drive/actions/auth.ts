import { constVoid, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { DepAuthorizeSession, DepFs } from '../../../deps-types'
import { authorizeState } from '../../../deps-types/dep-authorize-session'
import { loadSession, saveAccountData, saveSession } from '../action'

export type AuthSessionDeps =
  & { sessionFile: string }
  & DepAuthorizeSession
  & DepFs<'fstat'>
  & DepFs<'writeFile'>
  & DepFs<'readFile'>

export const authSession = (): RTE.ReaderTaskEither<AuthSessionDeps, Error, void> => {
  return pipe(
    RTE.ask<AuthSessionDeps>(),
    RTE.chainTaskEitherK(loadSession),
    RTE.chainW(authorizeState),
    RTE.chainFirstW(saveAccountData),
    RTE.chainFirstW(saveSession),
    RTE.map(constVoid),
  )
}
