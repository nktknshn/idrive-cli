import * as TE from 'fp-ts/lib/TaskEither'
import * as E from 'fp-ts/lib/Either'

import { FileReadingError } from './errors'
import { JsonParsingError, tryParseJson } from './json'
import * as fs from 'fs/promises'
import { flow, pipe } from 'fp-ts/lib/function'
import { hasOwnProperty } from './util'
import { logger } from './logging'
import * as t from 'io-ts'
import { TextDecoder } from 'util'


export class TypeDecodingError extends Error {
    readonly tag = 'TypeDecodingError'

    constructor(
        public readonly errors: t.Errors,
        message?: string
    ) {
        super(message)
    }

    static is(v: Error): v is JsonParsingError {
        return hasOwnProperty(v, 'tag') && v.tag === 'TypeDecodingError'
    }

    // static create(errors: t.Errors): TypeDecodingError
    static create(errors: t.Errors, message?: string): TypeDecodingError {
        return new TypeDecodingError(errors, message)
    }

}

export class BufferDecodingError extends Error {
    readonly tag = 'BufferDecodingError'

    constructor(
        public readonly error: unknown,
        message?: string
    ) {
        super(message)
    }

    static is(v: Error): v is BufferDecodingError {
        return hasOwnProperty(v, 'tag') && v.tag === 'BufferDecodingError'
    }

    static create(errors: unknown, message?: string): BufferDecodingError {
        return new BufferDecodingError(errors, message)
    }

}

// ERR_ENCODING_INVALID_ENCODED_DATA
export const tryDecodeBuffer = (buf: ArrayBufferLike, fatal = true) => E.tryCatch(
    () => new TextDecoder('UTF-8', { fatal }).decode(buf),
    BufferDecodingError.create
)

export function tryReadJsonFile(
    file: string,
): TE.TaskEither<BufferDecodingError | FileReadingError | JsonParsingError, unknown> {
    return pipe(
        TE.tryCatch(
            () => fs.readFile(file),
            FileReadingError.create
        ),
        TE.chainW(flow(tryDecodeBuffer, TE.fromEither)),
        TE.chainW(flow(tryParseJson, TE.fromEither)),
    )
}