import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as O from 'fp-ts/Option'
import { DriveLookup } from '..'
import { loadAccountDataFromFile, saveAccountDataToFile } from './account-data'
import { loadCacheFromFile, saveCacheToFile } from './cache'
import { loadSessionFromFile, saveSessionToFile } from './session'

export const loadDriveStateFromFiles = pipe(
  loadSessionFromFile,
  RTE.chain(loadAccountDataFromFile),
  RTE.bindW('cache', () => loadCacheFromFile),
  RTE.bindW('tempCache', () => RTE.of(O.none)),
)

export const saveDriveStateToFiles = (state: DriveLookup.State) =>
  pipe(
    RTE.of(state),
    RTE.chainFirstW(saveSessionToFile),
    RTE.chainFirstW(saveAccountDataToFile),
    RTE.chainFirstW(saveCacheToFile),
  )
