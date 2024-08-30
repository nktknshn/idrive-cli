import { constVoid, flow, identity, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'

import { DepFs } from '../../../deps-types'
import { DepAuthenticateSession } from '../../../deps-types/dep-authenticate-session'
import { authenticateState } from '../../../icloud-authentication/methods'
import { ICloudSession, session } from '../../../icloud-core/session/session-type'
import { saveAccountDataToFile } from '../../../icloud-drive/drive-persistence/account-data'
import { saveSessionToFile } from '../../../icloud-drive/drive-persistence/session'
import { printerIO } from '../../../logging/printerIO'
import { err } from '../../../util/errors'
import { prompts } from '../../../util/prompts'

type Argv = { skipLogin: boolean }

export type InitSessionDeps =
  & { sessionFile: string }
  & DepAuthenticateSession
  & DepFs<'fstat'>
  & DepFs<'writeFile'>

export const initSession = ({ skipLogin }: Argv): RTE.ReaderTaskEither<InitSessionDeps, Error, void> => {
  return pipe(
    RTE.ask<InitSessionDeps>(),
    RTE.chainFirstW(({ sessionFile, fs }) =>
      pipe(
        RTE.fromTaskEither(fs.fstat(sessionFile)),
        RTE.fold((e) => RTE.of(constVoid()), () =>
          RTE.left(
            err(
              `${sessionFile} already exists. To initiate session in a different file use option '-s':\nidrive init -s another-session.json`,
            ),
          )),
      )
    ),
    RTE.chainFirstIOK(({ sessionFile }) => (printerIO.print(`Snitializing session in ${sessionFile}`))),
    RTE.chainTaskEitherK(() => sessionQuest),
    !skipLogin
      ? flow(
        RTE.chainW(authenticateState),
        RTE.chainFirstW(saveAccountDataToFile),
      )
      : RTE.map(identity),
    RTE.chainFirstW(saveSessionToFile),
    RTE.chainW(() => RTE.ask<InitSessionDeps>()),
    RTE.chainFirstIOK(({ sessionFile }) => (printerIO.print(`Session initiated in ${sessionFile}`))),
    RTE.map(constVoid),
  )
}

const askUsername = () =>
  prompts({
    type: 'text',
    name: 'value',
    message: 'ICloud username',
  }, {
    onCancel: () => process.exit(1),
  })

const askPassword = () =>
  prompts({
    type: 'password',
    name: 'value',
    message: 'ICloud password',
  }, {
    onCancel: () => process.exit(1),
  })

const sessionQuest: TE.TaskEither<Error, {
  session: ICloudSession
}> = pipe(
  TE.Do,
  TE.bind('username', askUsername),
  TE.bind('password', askPassword),
  TE.map(
    ({ username, password }) => ({ session: session(username.value, password.value) }),
  ),
)
