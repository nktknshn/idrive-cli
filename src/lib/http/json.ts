import { pipe } from 'fp-ts/lib/function'
import * as O from 'fp-ts/lib/Option'
import * as TE from 'fp-ts/lib/TaskEither'
import { MissingResponseBody } from '../errors'
import { HttpResponse } from './fetch-client'

export function tryJsonFromResponse(
  response: HttpResponse,
): TE.TaskEither<MissingResponseBody, unknown> {
  return pipe(
    O.fromNullable(response.data),
    TE.fromOption(() => new MissingResponseBody(response, {})),
  )
}
