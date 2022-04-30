import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { not } from 'fp-ts/lib/Refinement'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { Drive, DriveApi } from '../../../icloud/drive/'
import { DepDriveApi } from '../../../icloud/drive/deps'
import { isTrashDetailsG } from '../../../icloud/drive/drive-types'
import { err } from '../../../util/errors'
import { normalizePath } from '../../../util/normalize-path'
import { XXX } from '../../../util/types'

type Deps = Drive.Deps & DepDriveApi<'putBackItemsFromTrash'>

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
        DriveApi.putBackItemsFromTrash<Drive.State>([item]),
        SRTE.map(() => `Success.`),
      )
    ),
  )
}
