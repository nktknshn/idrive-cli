import * as E from 'fp-ts/lib/Either'
import * as T from 'fp-ts/lib/Task'
import { ICloudSessionValidated } from '../../authorization/authorize'
import * as C from '../cache/cache'
import * as DF from '../ffdrive'

import { constant, flow, pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Reader'
import * as TE from 'fp-ts/lib/TaskEither'
import { EnvFiles } from '../../../cli/types'
import { fetchClient } from '../../../lib/http/fetch-client'
import { input } from '../../../lib/input'
import { logReturnAs } from '../../../lib/logging'
import { readAccountData } from '../../authorization/validate'
import { readSessionFile, saveSession } from '../../session/session-file'

const env = {
  retries: 3,
  fetch: fetchClient,
  getCode: () => input({ prompt: 'code: ' }),
}

export function cliActionM2<T>(
  action: () => DF.DriveM<T>,
): R.Reader<EnvFiles & { noCache: boolean }, TE.TaskEither<Error, T>> {
  return pipe(
    R.ask<EnvFiles & { noCache: boolean }>(),
    R.map(
      ({ sessionFile, cacheFile, noCache }) =>
        pipe(
          TE.Do,
          TE.bind('session', () => readSessionFile(sessionFile)),
          TE.bind('accountData', () => readAccountData(`${sessionFile}-accountData`)),
          TE.bindW('cache', ({}) =>
            pipe(
              noCache
                ? TE.of(C.cachef())
                : pipe(C.tryReadFromFile(cacheFile)),
              TE.orElseW((e) => pipe(e, logReturnAs('error'), () => TE.of(C.cachef()))),
            )),
          TE.chain(({ cache, session, accountData }) =>
            pipe(
              action()({ cache, session: { session, accountData } })(env),
              T.chain(
                E.fold(
                  ({ error, state: { session, cache } }) =>
                    pipe(
                      saveSession(sessionFile)(session.session),
                      TE.chain(() => C.trySaveFile(cache, cacheFile)),
                      () => TE.left(error),
                    ),
                  ([result, { session, cache }]) =>
                    pipe(
                      saveSession(sessionFile)(session.session),
                      TE.chain(() => C.trySaveFile(cache, cacheFile)),
                      TE.map(constant(result)),
                    ),
                ),
              ),
            )
          ),
        ),
    ),
  )
}
