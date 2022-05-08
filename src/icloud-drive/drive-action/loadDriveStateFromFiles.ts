import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { C } from '..'
import { loadAccountDataFromFile } from './loadAccountDataFromFile'
import { loadCacheFromFile } from './loadCacheFromFile'
import { loadSessionFromFile } from './loadSessionFromFile'

export const loadDriveStateFromFiles = pipe(
  loadSessionFromFile,
  RTE.chain(loadAccountDataFromFile),
  RTE.bindW('cache', () => loadCacheFromFile),
  RTE.bindW('tempCache', () => RTE.of(C.cachef())),
  RTE.bindW('tempCacheActive', () => RTE.of(false)),
)
