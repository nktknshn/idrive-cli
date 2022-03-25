import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as J from 'fp-ts/lib/Json'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { BufferDecodingError, err, FileReadingError, JsonParsingError, TypeDecodingError } from '../../lib/errors'
import { tryReadJsonFile } from '../../lib/files'
import { DepFs } from '../drive/deps'
import { ICloudSession, sessionScheme } from './session'

export type SessionFileReadingResult = TE.TaskEither<
  FileReadingError | BufferDecodingError | JsonParsingError | TypeDecodingError,
  ICloudSession
>

export const saveSession = (session: ICloudSession) =>
  ({ sessionFile }: { sessionFile: string }): RTE.ReaderTaskEither<DepFs<'writeFile'>, Error, void> =>
    ({ fs: { writeFile } }) =>
      pipe(
        TE.fromEither(J.stringify(session)),
        TE.mapLeft((e) => e instanceof Error ? e : new Error(`error stringifying session: ${e}`)),
        TE.chainW((content) => writeFile(sessionFile, content)),
      )

export function readSessionFile(
  { sessionFile }: { sessionFile: string },
): (deps: DepFs<'readFile'>) => SessionFileReadingResult {
  return (deps) =>
    pipe(
      tryReadJsonFile(sessionFile)(deps),
      TE.map(
        flow(
          sessionScheme.decode,
          E.mapLeft((e) => TypeDecodingError.create(e, 'error decoding session json')),
        ),
      ),
      TE.chainW(TE.fromEither),
    )
}
