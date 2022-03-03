import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { not } from 'fp-ts/lib/Refinement'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { defaultApiEnv } from '../../../defaults'
import * as API from '../../../icloud/drive/api'
import { Use } from '../../../icloud/drive/api/type'
import * as DF from '../../../icloud/drive/drive'
import { isTrashDetailsG } from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { cliActionM2 } from '../../cli-action'
import { normalizePath } from './helpers'

type Deps = DF.DriveMEnv & Use<'putBackItemsFromTrashM'>

export const recover = (
  { path }: { path: string },
) => {
  const npath = pipe(path, normalizePath)

  return pipe(
    SRTE.ask<DF.State, Deps>(),
    SRTE.bindTo('api'),
    SRTE.bindW('item', () =>
      pipe(
        DF.chainCachedTrash(trash => DF.getByPaths(trash, [npath])),
        DF.map(NA.head),
        DF.filterOrElse(not(isTrashDetailsG), () => err(`you cannot recover trash root`)),
      )),
    SRTE.chainW(({ item, api }) =>
      pipe(
        api.putBackItemsFromTrashM<DF.State>([item]),
        DF.map(() => `Success.`),
      )
    ),
  )
}
