import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { DriveActions, DriveLookup } from '../../../icloud-drive'

export const edit = (
  args: { path: string; editor: string },
): DriveLookup.Lookup<string, DriveActions.DepsEdit> => {
  return pipe(
    DriveActions.edit(args),
    SRTE.map(res =>
      res === 'success'
        ? 'File was saved.'
        : res === 'not-modified'
        ? 'File was not modified.'
        : 'Canceled.'
    ),
  )
}
