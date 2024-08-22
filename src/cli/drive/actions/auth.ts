import { constVoid, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { DepAuthenticateSession, DepFs } from '../../../deps-types'
import { authenticateState } from '../../../icloud-authentication/methods'
import { loadSession, saveAccountData, saveSession } from '../action'

export type AuthSessionDeps =
  & { sessionFile: string }
  & DepAuthenticateSession
  & DepFs<'fstat'>
  & DepFs<'writeFile'>
  & DepFs<'readFile'>

export const authSession = (): RTE.ReaderTaskEither<AuthSessionDeps, Error, void> => {
  return pipe(
    RTE.ask<AuthSessionDeps>(),
    RTE.chainTaskEitherK(loadSession),
    RTE.chainW(authenticateState),
    RTE.chainFirstW(saveAccountData),
    RTE.chainFirstW(saveSession),
    RTE.map(constVoid),
  )
}
