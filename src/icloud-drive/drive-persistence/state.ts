import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as O from 'fp-ts/Option'
import { loadAccountDataFromFile } from './account-data'
import { loadCacheFromFile } from './cache'
import { loadSessionFromFile } from './session'

export const loadDriveStateFromFiles = pipe(
  loadSessionFromFile,
  RTE.chain(loadAccountDataFromFile),
  RTE.bindW('cache', () => loadCacheFromFile),
  RTE.bindW('tempCache', () => RTE.of(O.none)),
)
