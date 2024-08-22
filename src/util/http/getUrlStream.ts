import { apply } from 'fp-ts/function'
import { flow, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { Readable } from 'stream'
import { DepFetchClient } from '../../deps-types/dep-fetchclient'
import { getUrlStream as getUrlStream_ } from '../../icloud-drive/drive-requests/download'

export const getUrlStream = ({ url }: {
  url: string
}): RTE.ReaderTaskEither<DepFetchClient, Error, Readable> =>
  pipe(
    RTE.ask<DepFetchClient>(),
    RTE.chainTaskEitherK(flow(getUrlStream_, apply({ url }))),
  )
