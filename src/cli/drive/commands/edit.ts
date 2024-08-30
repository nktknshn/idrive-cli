import { DriveActions, DriveLookup } from '../../../icloud-drive'

export const edit = (
  args: { path: string; editor: string },
): DriveLookup.Lookup<void, DriveActions.DepsEdit> => {
  return DriveActions.edit(args)
}
