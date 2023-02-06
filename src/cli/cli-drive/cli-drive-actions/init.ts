import { constVoid, flow, identity, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { DepFs } from '../../../deps-types'
import { authorizeState, DepAuthorizeSession } from '../../../deps-types/dep-authorize-session'
import { ICloudSession, session } from '../../../icloud-core/session/session-type'
import { err } from '../../../util/errors'
import { printerIO } from '../../../util/logging'
import { prompts } from '../../../util/prompts'
import { saveAccountData, saveSession } from '../cli-drive-action'

type Argv = { skipLogin: boolean }

export type InitSessionDeps =
  & { sessionFile: string }
  & DepAuthorizeSession
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
    RTE.chainFirstIOK(({ sessionFile }) => (printerIO.print(`initializing session in ${sessionFile}`))),
    RTE.chainTaskEitherK(() => sessionQuest),
    !skipLogin
      ? flow(
        RTE.chainW(authorizeState),
        RTE.chainFirstW(saveAccountData),
      )
      : RTE.map(identity),
    RTE.chainFirstW(saveSession),
    RTE.chainW(() => RTE.ask<InitSessionDeps>()),
    RTE.chainFirstIOK(({ sessionFile }) => (printerIO.print(`session initiated in ${sessionFile}`))),
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
