import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { not } from 'fp-ts/lib/Refinement'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { API } from '../../../icloud/drive/deps'
import { DepApi } from '../../../icloud/drive/deps/api-type'
import * as Drive from '../../../icloud/drive/drive'
import { isTrashDetailsG } from '../../../icloud/drive/types'
import { err } from '../../../lib/errors'
import { XXX } from '../../../lib/types'
import { normalizePath } from './helpers'

type Deps = Drive.Deps & DepApi<'putBackItemsFromTrash'>

export const recover = (
  { path }: { path: string },
): Drive.Effect<string, Deps> => {
  const npath = pipe(path, normalizePath)

  return pipe(
    Drive.chainCachedTrash(trash => Drive.getByPathsStrict(trash, [npath])),
    SRTE.map(NA.head),
    SRTE.filterOrElse(not(isTrashDetailsG), () => err(`you cannot recover trash root`)),
    SRTE.chainW((item) =>
      pipe(
        API.putBackItemsFromTrash<Drive.State>([item]),
        SRTE.map(() => `Success.`),
      )
    ),
  )
}
