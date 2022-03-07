import { constVoid, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import prompts_ from 'prompts'
import { authorizeSessionM } from '../../../icloud/authorization'
import { RequestEnv } from '../../../icloud/drive/requests/request'
import * as S from '../../../icloud/session/session'
import { err } from '../../../lib/errors'
import { printerIO } from '../../../lib/logging'
import { saveAccountData2, saveSession } from '../../cli-action'
import { fstat } from './download/helpers'

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

type Deps = RequestEnv & { sessionFile: string }

export const initSession = (): RTE.ReaderTaskEither<Deps, Error, void> => {
  return pipe(
    RTE.ask<Deps>(),
    RTE.bindTo('deps'),
    RTE.chainFirst(({ deps }) =>
      pipe(
        RTE.fromTaskEither(fstat(deps.sessionFile)),
        RTE.fold((e) => RTE.of(constVoid()), () => RTE.left(err(`error: ${deps.sessionFile} exists`))),
      )
    ),
    RTE.chain(({ deps }) => RTE.fromIO(printerIO.print(`initializing session in ${deps.sessionFile}`))),
    RTE.chainW(() =>
      pipe(
        RTE.Do,
        RTE.bindW('username', RTE.fromTaskEitherK(askUsername)),
        RTE.bindW('password', RTE.fromTaskEitherK(askPassword)),
        RTE.bindW('session', ({ username, password }) => RTE.of(S.session(username.value, password.value))),
      )
    ),
    RTE.chainW(authorizeSessionM()),
    RTE.chainFirstW(([accountData, state]) =>
      pipe(
        RTE.of({ session: state.session, accountData }),
        RTE.chainFirstW(saveSession),
        RTE.chainFirstW(saveAccountData2),
      )
    ),
    RTE.chainW(() => RTE.ask<Deps>()),
    RTE.chain(({ sessionFile }) => RTE.fromIO(printerIO.print(`session initiated in ${sessionFile}`))),
    RTE.map(constVoid),
  )
}
