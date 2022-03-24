import assert from 'assert'
import * as A from 'fp-ts/lib/Array'
import { flow, identity, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { swap } from 'fp-ts/lib/Tuple'
import * as O from 'fp-ts/Option'
import micromatch from 'micromatch'
import { Drive } from '../../../icloud/drive'
import {
  GetByPathResult,
  isValid,
  showGetByPathResult,
  target,
} from '../../../icloud/drive/cache/cache-get-by-path-types'
import {
  addPathToFolderTree,
  filterTree,
  showTreeWithFiles,
  treeWithFiles,
} from '../../../icloud/drive/drive-methods/get-folders-trees'
import { findInParentGlob, recordFromTuples } from '../../../icloud/drive/helpers'
import * as T from '../../../icloud/drive/types'
import { logger } from '../../../lib/logging'
import { NEA } from '../../../lib/types'
import { guardFst, Path } from '../../../lib/util'
// import { cliActionM } from '../../cli-action'
import { normalizePath } from './helpers'
import { showDetailsInfo, showFileInfo } from './ls/ls-printing'

type Argv = {
  recursive: boolean
  paths: string[]
  fullPath: boolean
  listInfo: boolean
  update: boolean
  trash: boolean
  depth: number
  raw: boolean
  glob: boolean
  cached: boolean
  etag: boolean
  header: boolean
  tree: boolean
}

export const listUnixPath = (
  { paths, raw, fullPath, recursive, depth, listInfo, trash, etag, cached, header, glob, tree }: Argv,
): Drive.Effect<string> => {
  assert(A.isNonEmpty(paths))

  const opts = { showDocwsid: false, showDrivewsid: listInfo, showEtag: etag, showHeader: header }

  const npaths = NA.map(normalizePath)(paths)

  const scanned = pipe(paths, NA.map(micromatch.scan))
  const basepaths = pipe(scanned, NA.map(_ => _.base), NA.map(normalizePath))

  if (recursive) {
    return recursivels({ paths, depth, tree })
  }

  const showRaw = (result: NEA<GetByPathResult<T.DetailsDocwsRoot | T.DetailsTrash>>) =>
    pipe(
      NA.zip(npaths)(result),
      NA.map(swap),
      recordFromTuples,
      JSON.stringify,
    )

  const showConsole = (result: NEA<GetByPathResult<T.DetailsDocwsRoot | T.DetailsTrash>>) =>
    pipe(
      NA.zip(npaths)(result),
      NA.map(([result, path]) => {
        if (result.valid) {
          const t = target(result)

          if (T.isDetails(t)) {
            return showDetailsInfo({ path, fullPath, printFolderInfo: true, ...opts })(t)
          }
          else {
            return showFileInfo({ ...opts })(t)
          }
        }

        return showGetByPathResult(result)
      }),
      npaths.length > 1
        ? flow(
          NA.zip(npaths),
          NA.map(([output, path]) => path + ':\n' + output),
          _ => _.join('\n\n'),
        )
        : v => NA.head(v),
    )

  // return pipe(
  //   Drive.getCachedRoot(trash),
  //   SRTE.chain(root =>
  //     cached
  //       ? Drive.getByPathsCached(root, npaths)
  //       : Drive.getByPathsH(root, npaths)
  //   ),
  //   SRTE.map(raw ? showRaw : showConsole),
  // )

  return pipe(
    // Drive.searchGlobs(paths as NEA<string>),
    Drive.getCachedRoot(trash),
    SRTE.chain(root =>
      cached
        ? Drive.getByPathsFromCache(root, basepaths)
        : Drive.getByPaths(root, basepaths)
    ),
    SRTE.map(NA.zip(scanned)),
    SRTE.map(A.filter(guardFst(isValid))),
    SRTE.map(A.map(([path, scan]) => {
      const t = target(path)

      if (T.isFile(t)) {
        return showFileInfo({ ...opts })(t)
      }

      const items = findInParentGlob(t, scan.glob)

      if (scan.glob.indexOf('**') > -1) {
        logger.error(
          `${scan.input} is invalid glob since globstar is not supported for non recursive ls. use ls -R instead`,
        )
      }

      return showDetailsInfo({ path: scan.base, fullPath, printFolderInfo: true, ...opts })({
        ...t,
        items,
      })
    })),
    // SRTE.map(A.flatten),
    SRTE.map(_ => _.join('\n\n')),
  )
}

const recursivels = ({ paths, depth, tree }: {
  paths: NA.NonEmptyArray<string>
  depth: number
  tree: boolean
}) => {
  const scanned = pipe(
    paths,
    NA.map(micromatch.scan),
    NA.map(scan => scan.isGlob ? scan : micromatch.scan(Path.join(scan.base, '**/*'))),
  )

  const basepaths = pipe(scanned, NA.map(_ => _.base), NA.map(normalizePath))

  if (tree) {
    return pipe(
      Drive.getDocwsRoot(),
      SRTE.bindTo('root'),
      SRTE.chain(({ root }) => Drive.getByPathsFolders(root, basepaths)),
      SRTE.chain(dirs => Drive.getFoldersTrees(dirs, depth)),
      SRTE.map(NA.zip(scanned)),
      SRTE.map(NA.map(([tree, scan]) =>
        pipe(
          treeWithFiles(tree),
          addPathToFolderTree(Path.dirname(scan.base), identity),
          filterTree(_ => micromatch.isMatch(_.path, scan.input)),
          O.fold(
            () => Path.dirname(scan.base) + '/',
            tree => showTreeWithFiles(tree),
          ),
        )
      )),
      SRTE.map(_ => _.join('\n\n')),
    )
  }

  return pipe(
    Drive.searchGlobs(pipe(scanned, NA.map(_ => _.input))),
    SRTE.map(NA.map(A.map(_ => _.path))),
    SRTE.map(NA.map(_ => _.join('\n'))),
    SRTE.map(_ => _.join('\n\n')),
  )
}
