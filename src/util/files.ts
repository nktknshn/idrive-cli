import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
// import * as fs from 'fs/promises'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { TextDecoder } from 'util'
import { DepFs } from '../icloud/deps/DepFetchClient'
import { BufferDecodingError, FileReadingError, JsonParsingError } from './errors'
import { tryParseJson } from './json'

// ERR_ENCODING_INVALID_ENCODED_DATA
export const tryDecodeBuffer = (buf: ArrayBufferLike, fatal = true): E.Either<BufferDecodingError, string> =>
  E.tryCatch(
    () => new TextDecoder('UTF-8', { fatal }).decode(buf),
    BufferDecodingError.create,
  )

export type ReadJsonFileError = BufferDecodingError | FileReadingError | JsonParsingError

export function tryReadJsonFile(
  file: string,
): RTE.ReaderTaskEither<
  DepFs<'readFile'>,
  BufferDecodingError | FileReadingError | JsonParsingError,
  unknown
> {
  return ({ fs: { readFile } }) =>
    pipe(
      readFile(file),
      TE.mapLeft(e => FileReadingError.create(e, e.message)),
      TE.chainW(flow(tryDecodeBuffer, TE.fromEither)),
      TE.chainW(flow(tryParseJson, TE.fromEither)),
    )
}
