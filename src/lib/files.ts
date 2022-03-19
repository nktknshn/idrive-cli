import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/lib/TaskEither'
import * as fs from 'fs/promises'
import { TextDecoder } from 'util'
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
): TE.TaskEither<
  BufferDecodingError | FileReadingError | JsonParsingError,
  unknown
> {
  return pipe(
    TE.tryCatch(() => fs.readFile(file), FileReadingError.create),
    TE.chainW(flow(tryDecodeBuffer, TE.fromEither)),
    TE.chainW(flow(tryParseJson, TE.fromEither)),
  )
}
