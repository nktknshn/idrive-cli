import { constVoid, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { DepAuthorizeSession, DepFs } from '../../../deps-types'
import { authorizeState } from '../../../deps-types/dep-authorize-session'
import { loadSession } from '../cli-drive-action'
import { saveAccountData, saveSession } from '../cli-drive-action'

type Argv = {}

export type AuthSessionDeps =
  & { sessionFile: string }
  & DepAuthorizeSession
  & DepFs<'fstat'>
  & DepFs<'writeFile'>
  & DepFs<'readFile'>

export const authSession = ({}: Argv): RTE.ReaderTaskEither<AuthSessionDeps, Error, void> => {
  return pipe(
    RTE.ask<AuthSessionDeps>(),
    RTE.chainTaskEitherK(loadSession),
    RTE.chainW(authorizeState),
    RTE.chainFirstW(saveAccountData),
    RTE.chainFirstW(saveSession),
    RTE.map(constVoid),
  )
}
