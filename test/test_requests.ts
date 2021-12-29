import assert from 'assert'
import * as E from 'fp-ts/Either'
import { apply, pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/TaskEither'
import { retrieveHierarchy } from '../src/icloud/drive/requests/retrieveHierarchy'
import { FetchClientEither, FetchError, HttpRequest, HttpResponse } from '../src/lib/http/fetch-client'
import { retrieveHierarchy1, validAccountdata, validSession } from './fixtures'

import * as M from './mocked-client'

describe('retrieveHierarchy', () => {
  it('works', async () => {
    const res = await retrieveHierarchy(
      M.mockedClient(M.fromList([
        config => M.response200(config, [retrieveHierarchy1]),
      ])),
      { accountData: validAccountdata, session: validSession },
      { drivewsids: ['FOLDER::F3LWYJ7GM7.com.apple.mobilegarageband::documents'] },
    )()

    assert(E.isRight(res))

    assert(res.right.response.body[0].drivewsid == 'FOLDER::F3LWYJ7GM7.com.apple.mobilegarageband::documents')
  })
})
