import assert from 'assert'
import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import micromatch from 'micromatch'
import { DriveQuery } from '../../../../icloud/drive'
import { findInParentGlob } from '../../../../icloud/drive/drive-helpers'
import {
  isValidPath,
  PathInvalid,
  pathTarget,
  PathValid,
  showGetByPathResult,
} from '../../../../icloud/drive/get-by-path-types'
import * as T from '../../../../icloud/drive/icloud-drive-types'
import { logger } from '../../../../util/logging'
import { normalizePath } from '../../../../util/normalize-path'
import { showDetailsInfo, showFileInfo } from './ls-printing'

export const shallowList = (
  paths: NA.NonEmptyArray<string>,
) =>
  (args: {
    fullPath: boolean
    listInfo: boolean
    trash: boolean
    raw: boolean
    glob: boolean
    cached: boolean
    etag: boolean
    header: boolean
  }): SRTE.StateReaderTaskEither<DriveQuery.State, DriveQuery.Deps, Error, string> => {
    assert(A.isNonEmpty(paths))

    const opts = { showDocwsid: false, showDrivewsid: args.listInfo, showEtag: args.etag, showHeader: args.header }

    // const npaths = NA.map(normalizePath)(paths)
    const scanned = pipe(paths, NA.map(micromatch.scan))
    const basepaths = pipe(scanned, NA.map(_ => _.base), NA.map(normalizePath))

    return pipe(
      // Drive.searchGlobs(paths as NEA<string>),
      DriveQuery.getCachedRoot(args.trash),
      SRTE.chain(root =>
        args.cached
          ? DriveQuery.getByPathsFromCache(root, basepaths)
          : DriveQuery.getByPaths(root, basepaths)
      ),
      SRTE.map(NA.zip(scanned)),
      SRTE.map(NA.map(([path, scan]) =>
        isValidPath(path)
          ? showValidPath(path, scan)({ ...args, ...opts })
          : // ({
          //   ...opts,
          //   path: scan.input,
          //   printFolderInfo: true,
          //   fullPath,
          // })
            showInvalid(path)
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

const showValidPath = (path: PathValid<T.Root>, scan: micromatch.ScanInfo) => {
  const t = pathTarget(path)

  if (T.isFile(t)) {
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

const showInvalid = (path: PathInvalid<T.Root>) => {
  return showGetByPathResult(path)
}
