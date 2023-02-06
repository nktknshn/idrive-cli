import { constVoid } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as Auth from '../../icloud-authorization'
import { BaseState } from '../../icloud-core/icloud-request'
import { saveSession as _saveSession } from '../../icloud-core/session/session-file'
import { C } from '..'

export const saveSession = <S extends BaseState>(state: S) =>
  RTE.asksReaderTaskEitherW(
    _saveSession(state.session),
  )

export const saveAccountData = <S extends { accountData: Auth.AccountData }>(
  state: S,
) =>
  RTE.asksReaderTaskEitherW((deps: { sessionFile: string }) =>
    Auth.saveAccountData(state.accountData, `${deps.sessionFile}-accountData`)
  )
export const saveCache = <S extends { cache: C.LookupCache }>(state: S) =>
  RTE.asksReaderTaskEitherW((deps: { cacheFile: string; noCache: boolean }) =>
    deps.noCache
      ? RTE.of(constVoid())
      : C.trySaveFile(state.cache)(deps.cacheFile)
  )
