import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as R from 'fp-ts/lib/Record'
import { DepFs } from '../../../deps-types/DepFs'
import { TypeDecodingError } from '../../../util/errors'
import { ReadJsonFileError, tryReadJsonFile } from '../../../util/files'
import { saveJson } from '../../../util/json'
import { cacheLogger } from '../../../util/logging'
import { Cache } from './cache'
import * as cachIo from './cache-io-types'
import * as CT from './cache-types'

export const trySaveFile = (
  cache: Cache,
) =>
  (cacheFilePath: string) => {
    cacheLogger.debug(`saving cache: ${R.keys(cache.byDrivewsid).length} items`)

    return pipe(
      cache,
      saveJson(cacheFilePath),
    )
  }

export const tryReadFromFile = (
  accountDataFilePath: string,
): RTE.ReaderTaskEither<DepFs<'readFile'>, Error | ReadJsonFileError, CT.CacheF> => {
  return pipe(
    tryReadJsonFile(accountDataFilePath),
    RTE.chainEitherKW(flow(
      cachIo.cache.decode,
      E.mapLeft(es => TypeDecodingError.create(es, 'wrong ICloudDriveCache json')),
    )),
  )
}
