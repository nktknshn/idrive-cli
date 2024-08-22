import * as A from 'fp-ts/lib/Array'
import { DriveLookup } from '../../../icloud-drive'
import { recursivels } from './ls/ls-recursive'
import { shallowList } from './ls/ls-shallow'

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
): DriveLookup.Effect<string> => {
  if (!A.isNonEmpty(paths)) {
    return DriveLookup.errString('no paths')
  }

  if (recursive) {
    return recursivels({ paths, depth, tree })
  }

  return shallowList(paths)({
    fullPath,
    listInfo,
    trash,
    etag,
    cached,
    header,
  })
}
