import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as Api from '../src/icloud/drive/api'
import { FetchClientEither, FetchError, HttpResponse } from '../src/lib/http/fetch-client'
import * as L from '../src/lib/logging'
import * as F from './fixtures'
import * as MC from './mocked-client'

describe('abc', () => {
  it('def', async () => {
    L.initLoggers({ debug: true }, [L.apiLogger])

    const fakeClientError: FetchClientEither = MC.always(
      E.left<FetchError, HttpResponse>(
        FetchError.create('error'),
      ),
    )

    const fakeClientInvalidSession: FetchClientEither = MC.func(
      (req) => {
        console.log(`${req.url}`)

        return pipe(
          E.of(MC.response421(req, {})),
        )
      },
    )

    const req = pipe(
      Api.retrieveItemDetailsInFolders(['a', 'b']),
      SRTE.execute({ session: F.validatedSession }),
    )

    console.log(
      await pipe(
        req({
          client: fakeClientInvalidSession,
          getCode: () => TE.of('1'),
        }),
      )(),
    )
  })
})
