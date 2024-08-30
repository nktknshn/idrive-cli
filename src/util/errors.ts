import * as E from 'fp-ts/lib/Either'
import * as t from 'io-ts'
import { HttpResponse } from './http/fetch-client'
import { isObjectWithOwnProperty } from './util'

export const wrapError = (message: string) => (e: Error): Error => new Error(`${message}: ${e.message}`)

export class InvalidGlobalSessionError extends Error {
  readonly tag = 'InvalidGlobalSessionResponse'
  constructor(public readonly httpResponse: HttpResponse) {
    super('InvalidGlobalSessionResponse')
  }
  public static is(a: Error): a is InvalidGlobalSessionError {
    return a instanceof InvalidGlobalSessionError
  }
  static create(httpResponse: HttpResponse): InvalidGlobalSessionError {
    return new InvalidGlobalSessionError(httpResponse)
  }
}

export class BadRequestError extends Error {
  readonly tag = 'BadRequestError'
  constructor(public readonly httpResponse: HttpResponse) {
    super('BadRequestError')
  }
  public static is(a: Error): a is BadRequestError {
    return a instanceof BadRequestError
  }
  static create(httpResponse: HttpResponse): BadRequestError {
    return new BadRequestError(httpResponse)
  }
}

export class UnexpectedResponse extends Error {
  readonly tag = 'UnexpectedResponse'
  constructor(
    public readonly httpResponse: HttpResponse,
    public readonly json: E.Either<unknown, unknown>,
  ) {
    super('UnexpectedResponse')
  }

  static is(error: Error): error is UnexpectedResponse {
    return (
      isObjectWithOwnProperty(error, 'tag') && error.tag === 'UnexpectedResponse'
    )
  }

  static create(httpResponse: HttpResponse, json: E.Either<unknown, unknown>): UnexpectedResponse {
    return new UnexpectedResponse(httpResponse, json)
  }
}

export class InvalidResponseStatusError extends Error {
  readonly tag = 'InvalidResponseStatusError'
  constructor(
    public readonly httpResponse: HttpResponse,
    public readonly message = 'InvalidResponseStatusError',
  ) {
    super(message)
  }

  static is(error: Error): error is InvalidResponseStatusError {
    return (
      isObjectWithOwnProperty(error, 'tag') && error.tag === 'InvalidResponseStatusError'
    )
  }

  static create(httpResponse: HttpResponse, message: string): InvalidResponseStatusError {
    return new InvalidResponseStatusError(httpResponse, message)
  }
}

export class FileReadingError extends Error {
  readonly tag = 'FileReadingError'

  constructor(public readonly error: unknown, message = 'FileReadingError') {
    super(message)
  }

  static is(v: Error): v is FileReadingError {
    return isObjectWithOwnProperty(v, 'tag') && v.tag === 'FileReadingError'
  }

  static create(err: unknown, message = 'FileReadingError'): FileReadingError {
    return new FileReadingError(err, message)
  }
}

export class SomeError extends Error {
  constructor(message?: string) {
    super(message)
  }

  public toString(): string {
    return `SomeError(${this.message})`
  }
}

export class InvalidJsonInResponse extends Error {
  constructor(
    public readonly httpResponse: HttpResponse,
    public readonly input: string,
  ) {
    super('InvalidJsonInResponse')
  }
  readonly tag = 'InvalidJsonInResponse'

  public static is(a: Error): a is InvalidJsonInResponse {
    return a instanceof InvalidJsonInResponse
  }

  static create(httpResponse: HttpResponse, input: string): InvalidJsonInResponse {
    return new InvalidJsonInResponse(httpResponse, input)
  }
}

export class MissingResponseBody extends Error {
  constructor(
    public readonly httpResponse: HttpResponse,
    public readonly error: unknown,
  ) {
    super('MissingResponseBody')
  }
  readonly tag = 'ErrorReadingResponseBody'

  public static is(a: Error): a is MissingResponseBody {
    return a instanceof MissingResponseBody
  }
}

export class JsonParsingError extends Error {
  constructor(
    public readonly input: string,
    public readonly error: unknown,
  ) {
    super(`JsonParsingError: ${error}`)
  }

  readonly tag = 'JsonParsingError'

  static is(v: Error): v is JsonParsingError {
    return isObjectWithOwnProperty(v, 'tag') && v.tag === 'JsonParsingError'
  }
}

export class TypeDecodingError extends Error {
  readonly tag = 'TypeDecodingError'

  constructor(public readonly errors: t.Errors, message = 'TypeDecodingError') {
    super(message)
  }

  static is(v: Error): v is JsonParsingError {
    return isObjectWithOwnProperty(v, 'tag') && v.tag === 'TypeDecodingError'
  }

  // static create(errors: t.Errors): TypeDecodingError
  static create(errors: t.Errors, message?: string): TypeDecodingError {
    return new TypeDecodingError(errors, message)
  }
}

export class BufferDecodingError extends Error {
  readonly tag = 'BufferDecodingError'

  constructor(public readonly error: unknown, message = 'BufferDecodingError') {
    super(message)
  }

  static is(v: Error): v is BufferDecodingError {
    return isObjectWithOwnProperty(v, 'tag') && v.tag === 'BufferDecodingError'
  }

  static create(errors: unknown, message?: string): BufferDecodingError {
    return new BufferDecodingError(errors, message)
  }
}

export class FileNotFoundError extends Error {
  readonly tag = 'FileNotFoundError'
  constructor(public readonly path: string) {
    super(`File not found: ${path}`)
  }

  static is(a: Error): a is FileNotFoundError {
    return a instanceof FileNotFoundError
  }

  static create(path: string): FileNotFoundError {
    return new FileNotFoundError(path)
  }
}

export class FileInvalidError extends Error {
  readonly tag = 'FileInvalidError'
  constructor(public readonly path: string) {
    super(`Invalid file: ${path}`)
  }

  static is(a: Error): a is FileInvalidError {
    return a instanceof FileInvalidError
  }

  static create(path: string): FileInvalidError {
    return new FileInvalidError(path)
  }
}

/** Returns `Error` with the given message */
export const err = (message: string): Error => new Error(message)

/** Returns `Error` with the given message if `e` is not an `Error` */
export const ensureError = (e: unknown): Error => e instanceof Error ? e : err(`${e}`)
