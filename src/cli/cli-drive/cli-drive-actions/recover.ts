import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { not } from 'fp-ts/lib/Refinement'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { DepDriveApi, DriveApi, DriveQuery } from '../../../icloud-drive/drive'
import { isTrashDetailsG } from '../../../icloud-drive/drive-requests/icloud-drive-items-types'
import { err } from '../../../util/errors'
import { normalizePath } from '../../../util/normalize-path'

type Deps = DriveQuery.Deps & DepDriveApi<'putBackItemsFromTrash'>

export const recover = (
  { path }: { path: string },
): DriveQuery.Effect<string, Deps> => {
  const npath = pipe(path, normalizePath)

  return pipe(
    DriveQuery.chainCachedTrash(trash => DriveQuery.getByPathsStrict(trash, [npath])),
    SRTE.map(NA.head),
    SRTE.filterOrElse(not(isTrashDetailsG), () => err(`you cannot recover trash root`)),
    SRTE.chainW((item) =>
      pipe(
        DriveApi.putBackItemsFromTrash<DriveQuery.State>([item]),
        SRTE.map(() => `Success.`),
      )
    ),
  )
}
