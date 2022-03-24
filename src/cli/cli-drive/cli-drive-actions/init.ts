import { constVoid, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { API } from '../../../icloud/drive/deps'
import { DepApi } from '../../../icloud/drive/deps/api-type'
import * as S from '../../../icloud/session/session'
import { err } from '../../../lib/errors'
import { DepFs } from '../../../lib/fs'
import { printerIO } from '../../../lib/logging'
import { prompts } from '../../../lib/util'
import { saveAccountData, saveSession } from '../../cli-action'

type Deps =
  & { sessionFile: string }
  & DepApi<'authorizeSession'>
  & DepFs<'fstat'>
  & DepFs<'writeFile'>

export const initSession = (): RTE.ReaderTaskEither<Deps, Error, void> => {
  return pipe(
    RTE.ask<Deps>(),
    RTE.chainFirst(({ sessionFile, fs }) =>
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
