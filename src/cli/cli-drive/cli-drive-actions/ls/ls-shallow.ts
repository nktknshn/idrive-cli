import assert from 'assert'
import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import micromatch from 'micromatch'
import { Drive } from '../../../../icloud/drive'
import { getByIdO } from '../../../../icloud/drive/cache/cache'
import {
  isValidPath,
  PathInvalid,
  pathTarget,
  PathValid,
  showGetByPathResult,
} from '../../../../icloud/drive/cache/cache-get-by-path-types'
import { findInParentGlob } from '../../../../icloud/drive/helpers'
import * as T from '../../../../icloud/drive/types'
import { loggerIO } from '../../../../util/loggerIO'
import { logger } from '../../../../util/logging'
import { normalizePath } from '../../../../util/normalize-path'
import { showDetailsInfo, showFileInfo } from './ls-printing'

export const shallowList = (
  { paths, raw, fullPath, listInfo, trash, etag, cached, header, glob }: {
    paths: NA.NonEmptyArray<string>
    fullPath: boolean
    listInfo: boolean
    trash: boolean
    raw: boolean
    glob: boolean
    cached: boolean
    etag: boolean
    header: boolean
  },
) => {
  assert(A.isNonEmpty(paths))

  const opts = { showDocwsid: false, showDrivewsid: listInfo, showEtag: etag, showHeader: header }

  // const npaths = NA.map(normalizePath)(paths)
  const scanned = pipe(paths, NA.map(micromatch.scan))
  const basepaths = pipe(scanned, NA.map(_ => _.base), NA.map(normalizePath))

  return pipe(
    // Drive.searchGlobs(paths as NEA<string>),
    Drive.getCachedRoot(trash),
    SRTE.chain(root =>
      cached
        ? Drive.getByPathsFromCache(root, basepaths)
        : Drive.getByPaths(root, basepaths)
    ),
    SRTE.map(NA.zip(scanned)),
    SRTE.map(NA.map(([path, scan]) =>
      isValidPath(path)
        ? showValid(path, scan)({
          ...opts,
          path: scan.input,
          printFolderInfo: true,
          fullPath,
        })
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

const showValid = (path: PathValid<T.Root>, scan: micromatch.ScanInfo) => {
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

  return showDetailsInfo({
    ...t,
    items,
  })
  // ({ path: scan.base, fullPath, printFolderInfo: true, ...opts })
}

const showInvalid = (path: PathInvalid<T.Root>) => {
  return showGetByPathResult(path)
}
