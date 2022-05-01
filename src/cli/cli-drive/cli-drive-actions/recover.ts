import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { not } from 'fp-ts/lib/Refinement'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { DriveApi, Query } from '../../../icloud/drive/'
import { DepDriveApi } from '../../../icloud/drive/drive-api/deps'
import { isTrashDetailsG } from '../../../icloud/drive/drive-api/icloud-drive-types'
import { err } from '../../../util/errors'
import { normalizePath } from '../../../util/normalize-path'
import { XXX } from '../../../util/types'

type Deps = Query.Deps & DepDriveApi<'putBackItemsFromTrash'>

export const recover = (
  { path }: { path: string },
): Query.Effect<string, Deps> => {
  const npath = pipe(path, normalizePath)

  return pipe(
    Query.chainCachedTrash(trash => Query.getByPathsStrict(trash, [npath])),
    SRTE.map(NA.head),
    SRTE.filterOrElse(not(isTrashDetailsG), () => err(`you cannot recover trash root`)),
    SRTE.chainW((item) =>
      pipe(
        DriveApi.putBackItemsFromTrash<Query.State>([item]),
        SRTE.map(() => `Success.`),
      )
    ),
  )
}
