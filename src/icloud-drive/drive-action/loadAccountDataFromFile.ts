import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { authorizeState, DepAuthorizeSession, DepFs } from '../../deps-types'
import * as Auth from '../../icloud-authorization'
import { AuthorizedState, BaseState } from '../../icloud-core/icloud-request'
import { loggerIO } from '../../logging/loggerIO'

export const loadAccountDataFromFile = (
  { session }: BaseState,
): RTE.ReaderTaskEither<
  DepAuthorizeSession & { sessionFile: string } & DepFs<'readFile'>,
  Error,
  AuthorizedState
> =>
  pipe(
    RTE.asksReaderTaskEitherW(
      (deps: { sessionFile: string }) => Auth.readAccountData(`${deps.sessionFile}-accountData`),
    ),
    RTE.map(accountData => ({ session, accountData })),
    RTE.orElseW(e =>
      pipe(
        loggerIO.error(`couldn't read account data from file. (${e}). Fetching from the icloud server`),
        RTE.fromIO,
        RTE.chain(() => authorizeState({ session })),
      )
    ),
  )
