import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import micromatch from 'micromatch'

import { logger } from '../../../logging'
import { normalizePath } from '../../../util/normalize-path'
import { DriveLookup, Types } from '../../'
import { findInParentGlob } from '../../util/drive-helpers'

import * as GetByPath from '../../util/get-by-path-types'

import { err } from '../../../util/errors'
import { showDetailsInfo, showFileInfo } from './ls-printing'

type ListPathsResult = ListPathsFolder | ListPathsFile | ListPathsInvalid

type ListPathsFolder = {
  valid: true
  path: string
  item: Types.Root | Types.DetailsFolder | Types.DetailsAppLibrary
  items: (Types.DriveChildrenItem | Types.DriveChildrenTrashItem)[]
}

type ListPathsFile = {
  valid: true
  path: string
  item: Types.DriveChildrenItemFile
}

type ListPathsInvalid = {
  valid: false
  path: string
}

const result = (
  path: string,
  scan: micromatch.ScanInfo,
  res: GetByPath.GetByPathResult<Types.Root>,
): ListPathsResult => {
  if (GetByPath.isInvalidPath(res)) {
    return { valid: false, path }
  }
  else {
    if (GetByPath.isValidFile(res)) {
      return { valid: true, path, item: res.file }
    }
    else {
      const folder = GetByPath.pathTarget(res)
      return {
        valid: true,
        path,
        item: folder,
        items: findInParentGlob(folder, scan.glob),
      }
    }
  }
}

export const listPaths = (
  { paths, trash, cached }: { paths: NA.NonEmptyArray<string>; trash: boolean; cached: boolean },
): DriveLookup.Lookup<ListPathsResult[], DriveLookup.Deps> => {
  const scanned = pipe(paths, NA.map(micromatch.scan))
  const basepaths = pipe(scanned, NA.map(_ => _.base), NA.map(normalizePath))

  for (const p of paths) {
    if (p.indexOf('**') > -1) {
      return SRTE.left(err('globstar is not supported for non recursive ls'))
    }
  }

  return pipe(
    // Drive.searchGlobs(paths as NEA<string>),
    DriveLookup.getCachedRoot(trash),
    SRTE.chain(root =>
      cached
        ? DriveLookup.getByPathsFromCache(root, basepaths)
        : DriveLookup.getByPaths(root, basepaths)
    ),
    SRTE.map(NA.zip(scanned)),
    SRTE.map(NA.zip(paths)),
    SRTE.map(
      NA.map(([[res, scan], path]) => result(path, scan, res)),
    ),
  )
}

export const lsShallow = (
  paths: NA.NonEmptyArray<string>,
) =>
  (args: {
    fullPath: boolean
    listInfo: boolean
    trash: boolean
    cached: boolean
    etag: boolean
    header: boolean
  }): DriveLookup.Lookup<string, DriveLookup.Deps> => {
    const opts = { showDocwsid: false, showDrivewsid: args.listInfo, showEtag: args.etag, showHeader: args.header }

    const scanned = pipe(paths, NA.map(micromatch.scan))
    const basepaths = pipe(scanned, NA.map(_ => _.base), NA.map(normalizePath))

    return pipe(
      // Drive.searchGlobs(paths as NEA<string>),
      DriveLookup.getCachedRoot(args.trash),
      SRTE.chain(root =>
        args.cached
          ? DriveLookup.getByPathsFromCache(root, basepaths)
          : DriveLookup.getByPaths(root, basepaths)
      ),
      SRTE.map(NA.zip(scanned)),
      SRTE.map(NA.map(([path, scan]) =>
        GetByPath.isValidPath(path)
          ? showValidPath(path, scan)({ ...args, ...opts })
          : showInvalid(path)
      )),
      SRTE.map(NA.zip(scanned)),
      SRTE.map(res =>
        res.length == 1
          ? [NA.head(res[0])]
          : pipe(res, NA.map(([output, { input }]) => `${input}:\n${output}`))
      ),
      SRTE.map(_ => _.join('\n\n')),
    )
  }

const showValidPath = (path: GetByPath.PathValid<Types.Root>, scan: micromatch.ScanInfo) => {
  const t = GetByPath.pathTarget(path)

  if (Types.isFile(t)) {
    return showFileInfo(t)
  }

  const items = findInParentGlob(t, scan.glob)

  if (scan.glob.indexOf('**') > -1) {
    logger.error(
      `${scan.input} globstar is not supported for non recursive ls. use ls -R instead`,
    )
  }

  return showDetailsInfo({ ...t, items }, scan.input)
}

const showInvalid = (path: GetByPath.PathInvalid<Types.Root>) => {
  return GetByPath.showGetByPathResult(path)
}
