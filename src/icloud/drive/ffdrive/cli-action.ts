import { ICloudSessionValidated } from '../../authorization/authorize'
import * as C from '../cache/cache'
import * as DF from '../ffdrive'

import { constant, pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Reader'
import * as TE from 'fp-ts/lib/TaskEither'
import { EnvFiles } from '../../../cli/types'
import { fetchClient } from '../../../lib/http/fetch-client'
import { input } from '../../../lib/input'
import { logReturnAs } from '../../../lib/logging'
import { readAccountData } from '../../authorization/validate'
import { readSessionFile, saveSession } from '../../session/session-file'

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
          TE.bind('result', ({ cache, session, accountData }) =>
            action()({
              cache,
              session: { session, accountData },
            })({
              retries: 3,
              fetch: fetchClient,
              getCode: () => input({ prompt: 'code: ' }),
            }) // TE.bracket(
            //   TE.of({}),
            //   () =>
            //     action()({
            //       cache,
            //       session: { session, accountData },
            //     })({
            //       retries: 3,
            //       fetch: fetchClient,
            //       getCode: () => input({ prompt: 'code: ' }),
            //     }),
            //   ({}, e) =>
            //     pipe(
            //       saveSession(sessionFile)(api.getSession().session),
            //       // TE.chain(() =>
            //       //   (E.isLeft(e) && InconsistentCache.is(e.left)) || noCache || dontSaveCache
            //       //     ? TE.of(constVoid())
            //       //     : Cache.trySaveFile(cache, cacheFile)
            //       // ),
            //       // logReturn(() => stderrLogger.info(`apiCalls: ${JSON.stringify(api.apiCalls)}`)),
            //     ),
            // )
          ),
          TE.chain(({ result: [result, { session, cache }] }) =>
            pipe(
              saveSession(sessionFile)(session.session),
              TE.chain(() => C.trySaveFile(cache, cacheFile)),
              TE.map(constant(result)),
            )
          ),
        ),
    ),
  )
}
