import * as A from 'fp-ts/lib/Array'
import { constVoid, pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { DriveLookup } from '../../../icloud-drive'

import * as Actions from '../../../icloud-drive/actions'
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
    return SRTE.left(err('no paths provided'))
  }

  return pipe(
    Actions.rm(paths, { skipTrash, force, recursive }),
    SRTE.map(constVoid),
  )
}
