import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as J from 'fp-ts/lib/Json'
import * as O from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import * as fs from 'fs/promises'
import { error, JsonParsingError, MissingResponseBody } from './errors'
import { HttpResponse } from './fetch-client'

export function tryParseJson(
  input: string,
): E.Either<JsonParsingError, unknown> {
  return E.tryCatch(
    () => JSON.parse(input),
    (e) => new JsonParsingError(input, e),
  )
}

export function tryJsonFromResponse(
  response: HttpResponse,
): TE.TaskEither<MissingResponseBody, unknown> {
  return pipe(
    O.fromNullable(response.data),
    TE.fromOption(() => new MissingResponseBody(response, {})),
  )
}

export const saveJson = (file: string) =>
  (json: unknown): TE.TaskEither<Error, void> =>
    pipe(
      TE.fromEither(J.stringify(json)),
      TE.mapLeft((e) => e instanceof Error ? e : new Error(`error stringifying json: ${e}`)),
      TE.chainW((content) =>
        TE.tryCatch(
          () => fs.writeFile(file, content),
          (e) => error(`Error writing json ${String(e)}`),
        )
      ),
    )
