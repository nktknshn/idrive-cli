import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as O from 'fp-ts/Option'
import { defaultApiEnv } from '../../../defaults'
import * as API from '../../../icloud/drive/api'
import * as NM from '../../../icloud/drive/api/methods'
import { Use } from '../../../icloud/drive/api/type'
import * as DF from '../../../icloud/drive/drive'
import { consumeStreamToString, getUrlStream } from '../../../icloud/drive/requests/download'
import { isFile } from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { XXX } from '../../../lib/types'
import { cliActionM2 } from '../../cli-action'
import { normalizePath } from './helpers'

export const cat = (
  { path }: { path: string },
) => {
  return cat2({ path })
}

type Deps = DF.DriveMEnv & Use<'downloadM'> & Use<'getUrlStream'>

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
    SRTE.bindW('url', ({ item }) => NM.getUrl<DF.State>(item)),
    SRTE.chainW(({ api, url }) =>
      pipe(
        O.fromNullable(url),
        O.match(
          () => SRTE.left(err(`cannot get url`)),
          url =>
            SRTE.fromTaskEither(pipe(
              api.getUrlStream({ url }),
              TE.chain(consumeStreamToString),
            )),
        ),
      )
    ),
  )
}
