import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
// import * as API from '../../../icloud/drive/api'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import * as API from '../../../icloud/drive/api/methods'
import { Dep } from '../../../icloud/drive/api/type'
import * as DF from '../../../icloud/drive/drive'
import { consumeStreamToString } from '../../../icloud/drive/requests/download'
import { isFile } from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { XXX } from '../../../lib/types'
import { normalizePath } from './helpers'

export const cat = (
  { path }: { path: string },
) => {
  return cat2({ path })
}

type Deps = DF.DriveMEnv & Dep<'download'> & Dep<'fetchClient'>

export const cat2 = (
  { path }: { path: string },
): XXX<DF.State, Deps, string> => {
  const npath = pipe(path, normalizePath)

  return pipe(
    SRTE.ask<DF.State, Deps>(),
    SRTE.bindTo('api'),
    SRTE.bindW('root', () => DF.getRoot()),
    SRTE.bindW('item', ({ root }) =>
      pipe(
        DF.getByPaths(root, [npath]),
        SRTE.map(NA.head),
        SRTE.filterOrElse(isFile, () => err(`you cannot cat a directory`)),
      )),
    SRTE.bindW('url', ({ item }) => API.getItemUrl<DF.State>(item)),
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
