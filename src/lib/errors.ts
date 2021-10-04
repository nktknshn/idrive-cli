import { JsonParsingError } from "./json"
import { hasOwnProperty } from "./util"
import * as t from 'io-ts'

export class FileReadingError extends Error {
    readonly tag = 'FileReadingError'

    constructor(
        public readonly error: unknown,
        message?: string
    ) {
        super(message)
    }

    static is(v: Error): v is JsonParsingError {
        return hasOwnProperty(v, 'tag') && v.tag === 'FileReadingError'
    }

    static create(err: unknown): FileReadingError {
        return new FileReadingError(err)
    }

}

class SomeError extends Error {
    constructor(
        message?: string
    ) {
        super(message)
    }

    public toString() {
        return `SomeError(${this.message})`
    }
}


export const error = (message: string) => new SomeError(message)