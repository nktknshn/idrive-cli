import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import { SchemaEnv } from '../../../icloud/drive/api/deps'
import * as API from '../../../icloud/drive/api/drive-api-methods'
import { Dep } from '../../../icloud/drive/api/type'
import * as DF from '../../../icloud/drive/drive'
import { consumeStreamToString } from '../../../icloud/drive/requests/download'
import { isFile } from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { failingFetch } from '../../../lib/http/fetch-client'
import { XXX } from '../../../lib/types'
import { normalizePath } from './helpers'

type Deps = DF.DriveMEnv & Dep<'download'> & Dep<'fetchClient'> & SchemaEnv

export const cat = (
  { path }: { path: string },
): XXX<DF.State, Deps, string> => {
  const npath = pipe(path, normalizePath)

  return pipe(
    SRTE.ask<DF.State, Deps>(),
    SRTE.bindTo('deps'),
    SRTE.bindW('root', () => DF.getRoot()),
    SRTE.bindW('item', ({ root }) =>
      pipe(
        DF.getByPaths(root, [npath]),
        SRTE.map(NA.head),
        SRTE.filterOrElse(isFile, () => err(`you cannot cat a directory`)),
      )),
    SRTE.bindW('url', ({ item, deps }) =>
      pipe(
        API.getItemUrl<DF.State>(item),
        // SRTE.local(() => ({
        //   download: deps.schema.download({ ...deps.depsEnv, fetch: failingFetch(99) }),
        // })),
      )),
    SRTE.chain(({ url }) =>
      pipe(
        O.fromNullable(url),
        O.match(
          () => SRTE.left(err(`cannot get url`)),
          (url) =>
            SRTE.fromReaderTaskEither(
              pipe(
                API.getUrlStream({ url }),
                RTE.chainTaskEitherK(consumeStreamToString),
              ),
            ),
        ),
      )
    ),
  )
}
