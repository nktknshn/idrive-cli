import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { not } from 'fp-ts/lib/Refinement'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { Dep } from '../../../icloud/drive/api/type'
import * as DF from '../../../icloud/drive/drive'
import { isTrashDetailsG } from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { normalizePath } from './helpers'

type Deps = DF.DriveMEnv & Dep<'putBackItemsFromTrash'>

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
        SRTE.map(NA.head),
        SRTE.filterOrElse(not(isTrashDetailsG), () => err(`you cannot recover trash root`)),
      )),
    SRTE.chainW(({ item, api }) =>
      pipe(
        api.putBackItemsFromTrash<DF.State>([item]),
        SRTE.map(() => `Success.`),
      )
    ),
  )
}
