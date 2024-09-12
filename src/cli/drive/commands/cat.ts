import { DepFetchClient } from '../../../deps-types/dep-fetch-client'
import { DriveLookup } from '../../../icloud-drive'
import * as Actions from '../../../icloud-drive/drive-actions'
import { DepApiMethod } from '../../../icloud-drive/drive-api'

type Deps =
  & DriveLookup.Deps
  & DepApiMethod<'download'>
  & DepFetchClient

export const cat = (
  { path }: { path: string },
): DriveLookup.Lookup<string, Deps> => {
  return Actions.cat({ path })
}
