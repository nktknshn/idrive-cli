import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as J from 'fp-ts/lib/Json'
import * as TE from 'fp-ts/lib/TaskEither'
import * as fs from 'fs/promises'
import { BufferDecodingError, error, FileReadingError, JsonParsingError, TypeDecodingError } from '../../lib/errors'
import { tryReadJsonFile } from '../../lib/files'
import { ICloudSession, sessionScheme } from './session'

export type SessionFileReadingResult = TE.TaskEither<
  FileReadingError | BufferDecodingError | JsonParsingError | TypeDecodingError,
  ICloudSession
>

export const saveSession = (file: string) =>
  (session: ICloudSession): TE.TaskEither<Error, void> =>
    pipe(
      TE.fromEither(J.stringify(session)),
      TE.mapLeft((e) => e instanceof Error ? e : new Error(`error stringifying session: ${e}`)),
      TE.chainW((content) =>
        TE.tryCatch(
          () => fs.writeFile(file, content),
          (e) => error(`Error writing session ${String(e)}`),
        )
      ),
    )

export function readSessionFile(file: string): SessionFileReadingResult {
  return pipe(
    tryReadJsonFile(file),
    TE.map(
      flow(
        sessionScheme.decode,
        E.mapLeft((e) => TypeDecodingError.create(e, 'error decoding session json')),
      ),
    ),
    TE.chainW(TE.fromEither),
  )
}
