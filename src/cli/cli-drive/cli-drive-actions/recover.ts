import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { not } from 'fp-ts/lib/Refinement'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { Api, Drive } from '../../../icloud/drive/'
import { DepApi } from '../../../icloud/drive/deps'
import { isTrashDetailsG } from '../../../icloud/drive/types'
import { err } from '../../../lib/errors'
import { normalizePath } from '../../../lib/normalize-path'
import { XXX } from '../../../lib/types'

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
        Api.putBackItemsFromTrash<Drive.State>([item]),
        SRTE.map(() => `Success.`),
      )
    ),
  )
}
