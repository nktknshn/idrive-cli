import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { DepFs } from '../../deps-types'
import { BaseState } from '../../icloud-core/icloud-request'
import { readSessionFile } from '../../icloud-core/session/session-file'
import { saveSession as _saveSession } from '../../icloud-core/session/session-file'
import { debugTimeRTE } from '../../logging/debug-time'
import { err } from '../../util/errors'

export const loadSessionFromFile = pipe(
  RTE.asksReaderTaskEitherW(
    readSessionFile,
  ),
  RTE.orElse(
    (e) =>
      ({ sessionFile }) =>
        TE.left(
          err(
            `Couldn't read session file from '${sessionFile}' (${e}).`
              + `\nInit new session file by using command\n`
              + `\nidrive init -s ${sessionFile}`,
          ),
        ),
  ),
  RTE.map(session => ({ session })),
)

export const saveSessionToFile = <S extends BaseState>(
  state: S,
): RTE.ReaderTaskEither<{ sessionFile: string } & DepFs<'writeFile'>, Error, void> =>
  pipe(
    RTE.asksReaderTaskEitherW(
      _saveSession(state.session),
    ),
    debugTimeRTE('saveSession'),
  )
