import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { not } from 'fp-ts/lib/Refinement'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { API } from '../../../icloud/drive/api'
import { Dep } from '../../../icloud/drive/api/type'
import * as DF from '../../../icloud/drive/drive'
import { isTrashDetailsG } from '../../../icloud/drive/drive-requests/types/types'
import { err } from '../../../lib/errors'
import { XXX } from '../../../lib/types'
import { normalizePath } from './helpers'

type Deps = DF.DriveMEnv & Dep<'putBackItemsFromTrash'>

export const recover = (
  { path }: { path: string },
): XXX<DF.State, Deps, string> => {
  const npath = pipe(path, normalizePath)

  return pipe(
    DF.chainCachedTrash(trash => DF.getByPaths(trash, [npath])),
    SRTE.map(NA.head),
    SRTE.filterOrElse(not(isTrashDetailsG), () => err(`you cannot recover trash root`)),
    SRTE.chainW((item) =>
      pipe(
        API.putBackItemsFromTrash<DF.State>([item]),
        SRTE.map(() => `Success.`),
      )
    ),
  )
}
