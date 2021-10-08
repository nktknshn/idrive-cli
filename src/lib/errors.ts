import { JsonParsingError } from "./json"
import { hasOwnProperty, isObjectWithOwnProperty } from "./util"
import * as t from 'io-ts'
import { HttpResponse } from "./fetch-client"
import * as E from 'fp-ts/lib/Either';

export class InvalidGlobalSessionResponse extends Error {
    readonly tag = 'InvalidGlobalSessionResponse'

    constructor(public readonly httpResponse: HttpResponse) { super() }

    public static is(a: unknown): a is InvalidGlobalSessionResponse {
        return a instanceof InvalidGlobalSessionResponse
    }
}

export class UnexpectedResponse extends Error {
    readonly tag = 'UnexpectedResponse'
    constructor(
        public readonly httpResponse: HttpResponse,
        public readonly json: E.Either<unknown, unknown>,
    ) {
        super()
    }

    static is(error: unknown): error is UnexpectedResponse {
        return isObjectWithOwnProperty(error, 'tag') && error.tag === 'UnexpectedResponse'
    }

    static create(
        httpResponse: HttpResponse,
        json: E.Either<unknown, unknown>
    ) {
        return new UnexpectedResponse(httpResponse, json)
    }

    [Symbol.toString()]() {
        return `UnexpectedResponse(${this.httpResponse.status}, ${JSON.stringify(this.json)})`
    }
}

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