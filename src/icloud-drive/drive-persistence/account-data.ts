import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { DepAuthenticateSession, DepFs } from '../../deps-types'
import * as Auth from '../../icloud-authentication'
import { authenticateState } from '../../icloud-authentication/methods'
import { AuthenticatedState, BaseState } from '../../icloud-core/icloud-request'
import { debugTimeRTE } from '../../logging/debug-time'
import { loggerIO } from '../../logging/loggerIO'
import { appendFilename } from '../../util/filename'

export type Deps =
  & DepAuthenticateSession
  & { sessionFile: string }
  & DepFs<'readFile'>

export const accountDataFile = (sessionFile: string): string => appendFilename(sessionFile, '.accountdata')

export const loadAccountDataFromFile = (
  { session }: BaseState,
): RTE.ReaderTaskEither<
  DepAuthenticateSession & { sessionFile: string } & DepFs<'readFile'>,
  Error,
  AuthenticatedState
> =>
  pipe(
    RTE.asksReaderTaskEitherW(
      (deps: { sessionFile: string }) => Auth.readAccountData(accountDataFile(deps.sessionFile)),
    ),
    RTE.map(accountData => ({ session, accountData })),
    RTE.orElseW(e =>
      pipe(
        loggerIO.error(`couldn't read account data from file. (${e}). Fetching from the icloud server`),
        RTE.fromIO,
        RTE.chain(() => authenticateState({ session })),
      )
    ),
  )

export const saveAccountDataToFile = <S extends { accountData: Auth.AccountData }>(
  state: S,
): RTE.ReaderTaskEither<{ sessionFile: string } & DepFs<'writeFile'>, Error, void> =>
  pipe(
    RTE.asksReaderTaskEitherW((deps: { sessionFile: string }) =>
      Auth.saveAccountData(state.accountData, accountDataFile(deps.sessionFile))
    ),
    debugTimeRTE('saveAccountData'),
  )
