import { constVoid, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import * as API from '../../../icloud/drive/api/api-methods'
import { Dep } from '../../../icloud/drive/api/type'
import { RequestEnv } from '../../../icloud/drive/drive-requests/request'
import * as S from '../../../icloud/session/session'
import { err } from '../../../lib/errors'
import { printerIO } from '../../../lib/logging'
import { prompts } from '../../../lib/util'
import { saveAccountData, saveSession } from '../../cli-action'
import { fstat } from './download/download-helpers'

type Deps = RequestEnv & { sessionFile: string } & Dep<'authorizeSession'>

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
    RTE.chainW(API.authorizeState),
    RTE.chainFirstW(saveSession),
    RTE.chainFirstW(saveAccountData),
    RTE.chainW(() => RTE.ask<Deps>()),
    RTE.chain(({ sessionFile }) => RTE.fromIO(printerIO.print(`session initiated in ${sessionFile}`))),
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
