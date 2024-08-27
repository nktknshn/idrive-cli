import * as A from 'fp-ts/lib/Array'
import { DriveLookup } from '../../../icloud-drive'
import * as Actions from '../../../icloud-drive/actions'

type Argv = {
  paths: string[]
  fullPath: boolean
  listInfo: boolean
  header: boolean
  trash: boolean
  tree: boolean
  etag: boolean
  recursive: boolean
  depth: number
  cached: boolean
}

export const listUnixPath = (
  { paths, fullPath, recursive, depth, listInfo, trash, etag, cached, header, tree }: Argv,
): DriveLookup.Lookup<string> => {
  if (!A.isNonEmpty(paths)) {
    return DriveLookup.errString('no paths')
  }

  if (recursive) {
    return Actions.lsRecursive({ paths, depth, tree })
  }

  return Actions.lsShallow(paths)({
    fullPath,
    listInfo,
    trash,
    etag,
    cached,
    header,
  })
}
