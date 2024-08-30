import { constVoid } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { DepFs } from '../../deps-types'
import * as Auth from '../../icloud-authentication'
import { BaseState } from '../../icloud-core/icloud-request'
import { saveSession as saveSessionFile } from '../../icloud-core/session/session-file'
import { Cache } from '..'

export const saveSession = <S extends BaseState>(
  state: S,
): RTE.ReaderTaskEither<{ sessionFile: string } & DepFs<'writeFile'>, Error, void> =>
  RTE.asksReaderTaskEitherW(
    saveSessionFile(state.session),
  )

export const saveAccountData = <S extends { accountData: Auth.AccountData }>(
  state: S,
): RTE.ReaderTaskEither<{ sessionFile: string } & DepFs<'writeFile'>, Error, void> =>
  RTE.asksReaderTaskEitherW((deps: { sessionFile: string }) =>
    Auth.saveAccountData(state.accountData, `${deps.sessionFile}-accountData`)
  )

export const saveCache = <S extends { cache: Cache.LookupCache }>(
  state: S,
): RTE.ReaderTaskEither<{ cacheFile: string; noCache: boolean } & DepFs<'writeFile', 'fs'>, Error, void> =>
  RTE.asksReaderTaskEitherW((deps: { cacheFile: string; noCache: boolean }) =>
    deps.noCache
      ? RTE.of(constVoid())
      : Cache.trySaveFile(state.cache)(deps.cacheFile)
  )
