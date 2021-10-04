import * as TE from 'fp-ts/lib/TaskEither'
import * as E from 'fp-ts/lib/Either'
import * as J from 'fp-ts/lib/Json'
import * as O from 'fp-ts/lib/Option'
import * as t from 'io-ts'
import { error, FileReadingError } from '../../lib/errors'
import { JsonParsingError } from '../../lib/json'
import { ICloudSessionState, sessionScheme } from './session'
import * as fs from 'fs/promises'
import { TypeDecodingError, tryReadJsonFile, BufferDecodingError } from '../../lib/files'
import { flow, pipe } from 'fp-ts/lib/function'

// export function tryReadJsonFile(
//     file: string,
// ): TE.TaskEither<FileReadingError | JsonParsingError, unknown> {
//     return TE.tryCatch(
//         () => Deno.readTextFile(file),
//         e => new FileReadingError(String(e))
//     )
//         .flatMapE(v => tryParseJson(v).toTaskEither())
// }

export const saveJson = (file: string) => (json: unknown): TE.TaskEither<Error, void> =>
    pipe(
        TE.fromEither(J.stringify(json)),
        TE.mapLeft(e => e instanceof Error ? e : new Error(`error stringifying json: ${e}`)),
        TE.chainW(content => TE.tryCatch(
            () => fs.writeFile(file, content),
            e => error(`Error writing json ${String(e)}`)
        ))
    )

export const saveSession = (file: string) => (session: ICloudSessionState): TE.TaskEither<Error, void> =>
    pipe(
        TE.fromEither(J.stringify(session)),
        TE.mapLeft(e => e instanceof Error ? e : new Error(`error stringifying session: ${e}`)),
        TE.chainW(content => TE.tryCatch(
            () => fs.writeFile(file, content),
            e => error(`Error writing session ${String(e)}`)
        ))
    )

export type SessionFileReadingResult = TE.TaskEither<FileReadingError | BufferDecodingError | JsonParsingError | TypeDecodingError, ICloudSessionState>

export function tryReadSessionFile(
    file: string,
): SessionFileReadingResult {
    return pipe(
        tryReadJsonFile(file),
        TE.map(
            flow(
                sessionScheme.decode,
                E.mapLeft(e => TypeDecodingError.create(e, 'error decoding session json')))
        ),
        TE.chainW(TE.fromEither),
    )
}
