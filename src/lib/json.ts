import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import { hasOwnProperty } from "./util";
import { pipe } from "fp-ts/lib/function";
import { HttpResponse } from "./fetch-client";

export class InvalidJsonInResponse extends Error {
    constructor(
        public readonly httpResponse: HttpResponse,
        public readonly input: string,
    ) {
        super()
    }
    readonly tag = 'InvalidJsonInResponse'

    public static is(a: unknown): a is InvalidJsonInResponse {
        return a instanceof InvalidJsonInResponse
    }

    public toString() {
        return `InvalidJsonInResponse: ${this.input}`
    }
}

export class ErrorReadingResponseBody extends Error {
    constructor(
        public readonly httpResponse: HttpResponse,
        public readonly error: unknown,
    ) {
        super()
    }
    readonly tag = 'ErrorReadingResponseBody'

    public static is(a: unknown): a is ErrorReadingResponseBody {
        return a instanceof ErrorReadingResponseBody
    }
}

export class JsonParsingError extends Error {

    constructor(
        public readonly input: string,
        public readonly error: unknown,
    ) {
        super()
    }

    readonly tag = 'JsonParsingError'

    static is(v: Error): v is JsonParsingError {
        return hasOwnProperty(v, 'tag') && v.tag === 'JsonParsingError'
    }
}

export function tryParseJson(input: string): E.Either<JsonParsingError, unknown> {
    return E.tryCatch(
        () => JSON.parse(input),
        e => new JsonParsingError(input, e)
    )
}

export function tryJsonFromResponse(response: HttpResponse): TE.TaskEither<ErrorReadingResponseBody, unknown> {
    return pipe(
        O.fromNullable(response.data),
        TE.fromOption(() => new ErrorReadingResponseBody(response, {})),
    )
        // TE.tryCatch(
        //     async () => response.data,
        //     e => new ErrorReadingResponseBody(response, e)
        // ),
        // TE.chainW(v => TE.fromEither(tryParseJson(v))),
        // TE.mapLeft(e => JsonParsingError.is(e)
        //     ? new InvalidJsonInResponse(response, e) : e
        // ))
}