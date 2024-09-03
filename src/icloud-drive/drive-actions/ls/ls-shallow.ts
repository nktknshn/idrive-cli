import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import micromatch from 'micromatch'

import { err } from '../../../util/errors'
import { normalizePath } from '../../../util/normalize-path'
import { NEA } from '../../../util/types'
import { DriveLookup, Types } from '../..'
import { findInParentGlob } from '../../util/drive-helpers'
import * as GetByPath from '../../util/get-by-path-types'

export type ListPathResult = ListPathFolder | ListPathFile | ListPathInvalid

export type ListPathFolder = {
  isFile: false
  valid: true
  path: string
  parentItem: Types.Root | Types.DetailsFolder | Types.DetailsAppLibrary
  /** Filtered children */
  items: (Types.DriveChildrenItem | Types.DriveChildrenTrashItem)[]
  validation: GetByPath.PathValidFolder<Types.Root>
}

export type ListPathFile = {
  isFile: true
  valid: true
  path: string
  item: Types.DriveChildrenItemFile
  validation: GetByPath.PathValidFile<Types.Root>
}

export type ListPathInvalid = {
  valid: false
  validation: GetByPath.PathInvalid<Types.Root>
  path: string
}

const result = (
  path: string,
  scan: micromatch.ScanInfo,
  res: GetByPath.Result<Types.Root>,
): ListPathResult => {
  if (GetByPath.isInvalidPath(res)) {
    return { valid: false, path, validation: res }
  }
  else {
    if (GetByPath.isValidFile(res)) {
      return { valid: true, path, item: res.file, validation: res, isFile: true }
    }
    else {
      const folder = GetByPath.pathTarget(res)
      return {
        valid: true,
        path,
        parentItem: folder,
        items: findInParentGlob(folder, scan.glob),
        validation: res,
        isFile: false,
      }
    }
  }
}

export const listPaths = (
  { paths, trash, cached }: { paths: NA.NonEmptyArray<string>; trash: boolean; cached: boolean },
): DriveLookup.Lookup<NEA<ListPathResult>, DriveLookup.Deps> => {
  const scanned = pipe(paths, NA.map(micromatch.scan))
  const basepaths = pipe(scanned, NA.map(_ => _.base), NA.map(normalizePath))

  for (const p of paths) {
    if (p.indexOf('**') > -1) {
      return SRTE.left(err('globstar is not supported for non recursive ls'))
    }
  }

  const params = DriveLookup.onlyCache(cached)

  return pipe(
    DriveLookup.getCachedRootOrTrash(trash),
    SRTE.chain(root => DriveLookup.getByPaths(root, basepaths, params)),
    SRTE.map(NA.zip(scanned)),
    SRTE.map(NA.zip(paths)),
    SRTE.map(
      NA.map(([[res, scan], path]) => result(path, scan, res)),
    ),
  )
}
