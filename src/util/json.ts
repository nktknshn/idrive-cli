import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as J from 'fp-ts/lib/Json'
import * as O from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
// import * as fs from 'fs/promises'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { DepFs } from '../deps-types/dep-fs'
import { err, JsonParsingError, MissingResponseBody } from './errors'
import { HttpResponse } from './http/fetch-client'

export function tryParseJson(
  input: string,
): E.Either<JsonParsingError, unknown> {
  return E.tryCatch(
    () => JSON.parse(input),
    (e) => new JsonParsingError(input, e),
  )
}

export const saveJson = (file: string) =>
  (json: unknown): RTE.ReaderTaskEither<DepFs<'writeFile'>, Error, void> =>
    ({ fs }) =>
      pipe(
        TE.fromEither(J.stringify(json)),
        TE.mapLeft((e) => e instanceof Error ? e : new Error(`error stringifying json: ${e}`)),
        TE.chain((content) => fs.writeFile(file, content)),
      )
