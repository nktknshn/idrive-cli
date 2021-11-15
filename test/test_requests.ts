import assert from 'assert'
import * as E from 'fp-ts/Either'
import { apply, pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/TaskEither'
import { retrieveHierarchy } from '../src/icloud/drive/requests/retrieveHierarchy'
import { FetchClientEither, FetchError, HttpRequest, HttpResponse } from '../src/lib/fetch-client'
import { retrieveHierarchy1, validAccountdata, validSession } from './fixtures'

interface Responses {
  get(req: HttpRequest): E.Either<FetchError, HttpResponse>
}

const fromList = (responses: ((req: HttpRequest) => HttpResponse)[]): Responses => {
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

const mockedClient: (
  responses: Responses,
) => FetchClientEither = (responses) =>
  (cfg) => {
    return TE.fromEither(responses.get(cfg))
  }

const response200 = (config: HttpRequest, data: unknown) => ({
  data,
  config,
  headers: {},
  status: 200,
  statusText: 'OK',
})

describe('retrieveHierarchy', () => {
  it('works', async () => {
    const res = await retrieveHierarchy(
      mockedClient(fromList([
        config => response200(config, [retrieveHierarchy1]),
      ])),
      { accountData: validAccountdata, session: validSession },
      { drivewsids: ['FOLDER::F3LWYJ7GM7.com.apple.mobilegarageband::documents'] },
    )()

    assert(E.isRight(res))

    assert(res.right.response.body[0].drivewsid == 'FOLDER::F3LWYJ7GM7.com.apple.mobilegarageband::documents')
  })
})
