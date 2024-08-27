import { DriveLookup } from '../../../icloud-drive'
import * as Actions from '../../../icloud-drive/actions'

export const edit = (
  { path, editor }: { path: string; editor: string },
): DriveLookup.Lookup<void, Actions.DepsEdit> => {
  return Actions.edit({ fileEditor: editor, path })
}
