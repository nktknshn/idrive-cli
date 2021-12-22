import * as E from 'fp-ts/lib/Either'
import * as t from 'io-ts'
import { HttpResponse } from './http/fetch-client'
import { isObjectWithOwnProperty } from './util'

export class InvalidGlobalSessionResponse extends Error {
  readonly tag = 'InvalidGlobalSessionResponse'
  constructor(public readonly httpResponse: HttpResponse) {
    super('InvalidGlobalSessionResponse')
  }
  public static is(a: unknown): a is InvalidGlobalSessionResponse {
    return a instanceof InvalidGlobalSessionResponse
  }
  static create(httpResponse: HttpResponse): InvalidGlobalSessionResponse {
    return new InvalidGlobalSessionResponse(httpResponse)
  }
}

export class BadRequestError extends Error {
  readonly tag = 'BadRequestError'
  constructor(public readonly httpResponse: HttpResponse) {
    super('BadRequestError')
  }
  public static is(a: unknown): a is BadRequestError {
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

  static is(error: unknown): error is UnexpectedResponse {
    return (
      isObjectWithOwnProperty(error, 'tag') && error.tag === 'UnexpectedResponse'
    )
  }

  static create(httpResponse: HttpResponse, json: E.Either<unknown, unknown>): UnexpectedResponse {
    return new UnexpectedResponse(httpResponse, json)
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

  static create(err: unknown): FileReadingError {
    return new FileReadingError(err)
  }
}

export class SomeError extends Error {
  constructor(message?: string) {
    super(message)
  }

  public toString() {
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

  public static is(a: unknown): a is InvalidJsonInResponse {
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

  public static is(a: unknown): a is MissingResponseBody {
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

export const err = (message: string): SomeError => new SomeError(message)
export const ensureError = (e: unknown): SomeError => e instanceof Error ? e : err(`${e}`)
