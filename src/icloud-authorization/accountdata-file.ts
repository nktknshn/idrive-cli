import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { DepFs } from '../deps-types/dep-fs'
import { BufferDecodingError, FileReadingError, JsonParsingError, TypeDecodingError } from '../util/errors'
import { tryReadJsonFile } from '../util/files'
import { validateResponseJson } from './requests/validate'
import { type AccountData } from './type-accountdata'

export function saveAccountData(
  accountData: AccountData,
  accountDataFilePath: string,
): RTE.ReaderTaskEither<DepFs<'writeFile'>, Error, void> {
  return ({ fs: { writeFile } }) => writeFile(accountDataFilePath, JSON.stringify(accountData))
}

export function readAccountData(
  accountDataFilePath: string,
): RTE.ReaderTaskEither<
  DepFs<'readFile'>,
  FileReadingError | JsonParsingError | BufferDecodingError | TypeDecodingError,
  AccountData
> {
  return pipe(
    tryReadJsonFile(accountDataFilePath),
    RTE.chainTaskEitherKW((json) => {
      if (validateResponseJson(json)) {
        return TE.right(json)
      }
      return TE.left(
        TypeDecodingError.create([], 'wrong AccountLoginResponseBody'),
      )
    }),
  )
}
