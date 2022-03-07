import { constVoid, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import prompts_ from 'prompts'
import { authorizeSessionM } from '../../../icloud/authorization'
import { authorizeStateM3 } from '../../../icloud/authorization/authorize'
import { RequestEnv } from '../../../icloud/drive/requests/request'
import * as S from '../../../icloud/session/session'
import { err } from '../../../lib/errors'
import { printerIO } from '../../../lib/logging'
import { saveAccountData, saveSession } from '../../cli-action'
import { fstat } from './download/helpers'

type Deps = RequestEnv & { sessionFile: string }

export const initSession = (): RTE.ReaderTaskEither<Deps, Error, void> => {
  return pipe(
    RTE.ask<Deps>(),
    RTE.chainFirst(({ sessionFile }) =>
      pipe(
        RTE.fromTaskEither(fstat(sessionFile)),
        RTE.fold((e) => RTE.of(constVoid()), () =>
          RTE.left(
            err(
              `${sessionFile} already exists. To initiate session in a different file use option '-s':\nidrive init -s another-session.json`,
            ),
          )),
      )
    ),
    RTE.chain(({ sessionFile }) => RTE.fromIO(printerIO.print(`initializing session in ${sessionFile}`))),
    RTE.chainTaskEitherK(() =>
      pipe(
        TE.Do,
        TE.bind('username', askUsername),
        TE.bind('password', askPassword),
        TE.map(
          ({ username, password }) => ({ session: S.session(username.value, password.value) }),
        ),
      )
    ),
    RTE.chainW(authorizeStateM3),
    RTE.chainFirstW(saveSession),
    RTE.chainFirstW(saveAccountData),
    RTE.chainW(() => RTE.ask<Deps>()),
    RTE.chain(({ sessionFile }) => RTE.fromIO(printerIO.print(`session initiated in ${sessionFile}`))),
    RTE.map(constVoid),
  )
}

const prompts = TE.tryCatchK(prompts_, (e) => err(`error: ${e}`))

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
