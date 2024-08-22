import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { not } from 'fp-ts/lib/Refinement'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { DriveLookup } from '../../../icloud-drive'
import { DepApiMethod, DriveApiMethods } from '../../../icloud-drive/drive-api'
import { isTrashDetailsG } from '../../../icloud-drive/drive-types'
import { err } from '../../../util/errors'
import { normalizePath } from '../../../util/normalize-path'

type Deps = DriveLookup.Deps & DepApiMethod<'putBackItemsFromTrash'>

export const recover = (
  { path }: { path: string },
): DriveLookup.Effect<string, Deps> => {
  const npath = pipe(path, normalizePath)

  return pipe(
    DriveLookup.chainCachedTrash(trash => DriveLookup.getByPathsStrict(trash, [npath])),
    SRTE.map(NA.head),
    SRTE.filterOrElse(not(isTrashDetailsG), () => err(`you cannot recover trash root`)),
    SRTE.chainW((item) =>
      pipe(
        DriveApiMethods.putBackItemsFromTrash<DriveLookup.LookupState>([item]),
        SRTE.map(() => `Success.`),
      )
    ),
  )
}
