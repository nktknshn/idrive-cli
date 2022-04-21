import assert from 'assert'
import * as E from 'fp-ts/Either'
import { apply, pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/TaskEither'
import { retrieveHierarchy } from '../src/icloud/drive/requests/retrieveHierarchy'
import { FetchClientEither, FetchError, HttpRequest, HttpResponse } from '../src/util/http/fetch-client'
import { retrieveHierarchy1, validAccountdata, validSession } from './fixtures'

export interface Responses {
  get(req: HttpRequest): E.Either<FetchError, HttpResponse>
}

export const fromList = (responses: ((req: HttpRequest) => HttpResponse)[]): Responses => {
  let idx = 0

  return {
    get(req) {
      const resp = responses[idx]
      idx += 1
      return pipe(
        resp,
        E.fromNullable(FetchError.create('mocked client is out of responses')),
        E.map(apply(req)),
      )
    },
  }
}

export const mockedClient: (
  responses: Responses,
) => FetchClientEither = (responses) =>
  (cfg) => {
    return TE.fromEither(responses.get(cfg))
  }

export const func = (
  get: (req: HttpRequest) => E.Either<FetchError, HttpResponse>,
): FetchClientEither => mockedClient({ get })

export const always = (resp: E.Either<FetchError, HttpResponse>): FetchClientEither =>
  mockedClient({
    get: () => resp,
  })

export const response200 = (config: HttpRequest, data: unknown) => ({
  data,
  config,
  headers: {},
  status: 200,
  statusText: 'OK',
})

export const response421 = (config: HttpRequest, data: unknown) => ({
  data,
  config,
  headers: {},
  status: 421,
  statusText: 'OK',
})
