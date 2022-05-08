import assert from 'assert'
import * as E from 'fp-ts/Either'
import { apply, pipe } from 'fp-ts/lib/function'
import * as TE from 'fp-ts/TaskEither'
import { retrieveHierarchy } from '../src/icloud/drive/requests/retrieveHierarchy'
import { authorizedState, retrieveHierarchy1, validAccountdata } from './fixtures'

import * as M from './mocked-client'

/*
  M.mockedClient(M.fromList([
        config => M.response200(config, [retrieveHierarchy1]),
      ])),
      { accountData: validAccountdata, session: validSession },
      { drivewsids: ['FOLDER::F3LWYJ7GM7.com.apple.mobilegarageband::documents'] },
*/

describe('retrieveHierarchy', () => {
  it('works', async () => {
    const res = await retrieveHierarchy({
      drivewsids: ['FOLDER::F3LWYJ7GM7.com.apple.mobilegarageband::documents'],
    })(authorizedState)({
      fetchClient: M.mockedClient(M.fromList([
        config => M.response200(config, [retrieveHierarchy1]),
      ])),
    })()

    assert(E.isRight(res))

    assert(res.right[0][0].drivewsid == 'FOLDER::F3LWYJ7GM7.com.apple.mobilegarageband::documents')
  })
})
