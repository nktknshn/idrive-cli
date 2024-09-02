import * as A from 'fp-ts/lib/Array'
import { constVoid, pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { DriveLookup } from '../../../icloud-drive'

import * as Actions from '../../../icloud-drive/drive-actions'
import { printerIO } from '../../../logging/printerIO'
import { err } from '../../../util/errors'

export const rm = (
  { paths, skipTrash, force, recursive }: {
    paths: string[]
    skipTrash: boolean
    recursive: boolean
    force: boolean
  },
): DriveLookup.Lookup<void, Actions.DepsRm> => {
  if (!A.isNonEmpty(paths)) {
    return SRTE.left(err('No paths provided'))
  }

  return pipe(
    Actions.rm(paths, { skipTrash, force, recursive }),
    SRTE.chainFirstIOK(({ items }) => printerIO.print(`Removed ${items.length} items`)),
    SRTE.map(constVoid),
  )
}
