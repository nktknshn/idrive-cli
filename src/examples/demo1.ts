import { sequenceS } from 'fp-ts/lib/Apply'
import { flow, identity, pipe } from 'fp-ts/lib/function'
import { of } from 'fp-ts/lib/ReaderT'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { snd } from 'fp-ts/lib/ReadonlyTuple'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import * as TE from 'fp-ts/TaskEither'
import { loadCache, loadSessionFile, saveAccountData2, saveSession } from '../cli/cli-action'
import { normalizePath } from '../cli/cli-drive/cli-drive-actions/helpers'
import { defaultCacheFile, defaultSessionFile } from '../config'
import { defaultApiEnv } from '../defaults'
import { authorizeSessionM } from '../icloud/authorization'
import { authorizeSessionM2, authorizeSessionM3 } from '../icloud/authorization/authorize'
import { AccountLoginResponseBody } from '../icloud/authorization/types'
import { readAccountData, saveAccountData } from '../icloud/authorization/validate'
import * as API from '../icloud/drive/api'
import * as DF from '../icloud/drive/drive'
import * as RQ from '../icloud/drive/requests'
import * as AR from '../icloud/drive/requests/request'
import { rootDrivewsid } from '../icloud/drive/requests/types/types-io'
import * as S from '../icloud/session/session'
import { err, InvalidGlobalSessionError } from '../lib/errors'
import { apiLogger, authLogger, cacheLogger, initLoggers, logger, stderrLogger } from '../lib/logging'

initLoggers(
  { debug: true },
  [logger, cacheLogger, stderrLogger, apiLogger, authLogger],
)

const session = {
  session: S.session('user', 'passw'),
  someData: 1,
}

const ado = sequenceS(RTE.ApplySeq)

export const loadAccountData = (deps: { sessionFile: string }) =>
  pipe(
    readAccountData(`${deps.sessionFile}-accountData`),
    // TE.foldW(() => TE.of(undefined), a => TE.of(a)),
    // TE.fold(() => TE.of(O.none), a => TE.of(O.some(a))),
  )

const retrying = <R extends AR.Env, A, S extends { session: S.ICloudSession; accountData: AccountLoginResponseBody }>(
  rte: (
    s: S,
  ) => RTE.ReaderTaskEither<R, Error, A>,
) =>
  (
    s: S,
  ): RTE.ReaderTaskEither<R & { retries: number }, Error, A> => {
    // const r = RTE.flattenW(rte)

    return pipe(
      rte(s),
      RTE.orElse(
        (e) =>
          InvalidGlobalSessionError.is(e)
            ? pipe(
              authorizeSessionM3(s),
              RTE.chain(rte),
            )
            : RTE.left(e),
      ),
    )
  }

const saveState = <A>(
  res: [A, {
    session: S.ICloudSession
    accountData: AccountLoginResponseBody
  }],
) =>
  pipe(
    RTE.of(res),
    RTE.chainFirstW(flow(snd, saveAccountData2)),
    RTE.chainFirstW(flow(snd, saveSession)),
  )

const req1 = pipe(
  RTE.Do,
  RTE.bind('session', () => loadSessionFile),
  RTE.bindW('accountData', () => loadAccountData),
  RTE.bindW('cache', () => loadCache),
  RTE.chainW(
    retrying(
      // API.retrieveTrashDetails(),
      // RQ.retrieveItemDetailsInFoldersM({ drivewsids: [rootDrivewsid] }),
      DF.chainRoot(root => DF.lsdir(root, normalizePath('/'))),
    ),
  ),
  RTE.chainFirstW(saveState),
  // RTE.map(_ => _),
  RTE.fold(
    (e) => RTE.left(err(`error ${e}`)),
    v => RTE.of(JSON.stringify(v)),
  ),
)

const main = async () => {
  const t = req1({
    sessionFile: defaultSessionFile,
    cacheFile: defaultCacheFile,
    noCache: false,
    ...defaultApiEnv,
  })

  console.log(
    await t(),
  )
}

main()
