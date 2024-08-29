import { DepFetchClient } from '../../../deps-types/dep-fetch-client'
import { DriveLookup } from '../../../icloud-drive'
import * as Actions from '../../../icloud-drive/actions'
import { DepApiMethod } from '../../../icloud-drive/drive-api'

type Deps =
  & DriveLookup.Deps
  & DepApiMethod<'download'>
  & DepFetchClient

export const cat = (
  args: { path: string; skipValidation: boolean },
): DriveLookup.Lookup<string, Deps> => {
  return Actions.cat(args)
}
