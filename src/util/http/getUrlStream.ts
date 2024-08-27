import { apply } from 'fp-ts/function'
import { flow, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { Readable } from 'stream'
import { DepFetchClient } from '../../deps-types/dep-fetch-client'
import { err } from '../errors'
import { expectResponse, FetchClientEither } from './fetch-client'

const getUrlStream_ = ({ fetchClient }: { fetchClient: FetchClientEither }) =>
  (
    { url }: { url: string },
  ): TE.TaskEither<Error, Readable> => {
    return pipe(
      fetchClient({ method: 'GET', url, headers: {}, data: undefined, responseType: 'stream' }),
      expectResponse(
        _ => _.status == 200,
        _ => err(`responded ${_.status}`),
      ),
      TE.map(_ => _.data as Readable),
    )
  }

export const getUrlStream = ({ url }: {
  url: string
}): RTE.ReaderTaskEither<DepFetchClient, Error, Readable> =>
  pipe(
    RTE.ask<DepFetchClient>(),
    RTE.chainTaskEitherK(flow(getUrlStream_, apply({ url }))),
  )
