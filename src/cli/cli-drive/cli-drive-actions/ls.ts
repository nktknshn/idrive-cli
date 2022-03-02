import assert from 'assert'
import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TR from 'fp-ts/lib/Tree'
import { swap } from 'fp-ts/lib/Tuple'
import { GetByPathResult, showGetByPathResult, target } from '../../../icloud/drive/cache/cache-get-by-path-types'
import * as DF from '../../../icloud/drive/drive'
import { FolderTree } from '../../../icloud/drive/drive/get-folders-trees'
import { recordFromTuples } from '../../../icloud/drive/helpers'
import * as T from '../../../icloud/drive/requests/types/types'
import { err } from '../../../lib/errors'
import { NEA } from '../../../lib/types'
// import { cliActionM } from '../../cli-action'
import { Env } from '../../types'
import { normalizePath } from './helpers'
import { showDetailsInfo, showFileInfo } from './ls/printing'

export const listUnixPath2 = (
  { paths, raw, fullPath, recursive, depth, listInfo, trash, etag, cached, header, glob }: {
    recursive: boolean
    paths: string[]
    fullPath: boolean
    listInfo: boolean
    update: boolean
    trash: boolean
    depth: number
    glob: boolean
    raw: boolean
    cached: boolean
    etag: boolean
    header: boolean
  },
) => {
  const npaths = paths.map(normalizePath)
  assert(A.isNonEmpty(npaths))

  if (recursive) {
    const showTree = (
      tree: FolderTree<T.DetailsDocwsRoot | T.DetailsTrash | T.NonRootDetails>,
    ) => {
      return pipe(
        tree,
        TR.map(_ => T.fileName(_.details)),
        TR.drawTree,
      )
    }

    return pipe(
      DF.Do,
      SRTE.bind('root', DF.getRoot),
      DF.chain(({ root }) => DF.getByPaths(root, npaths)),
      DF.map(flow(A.filter(T.isDetails))),
      DF.chain(dirs => A.isNonEmpty(dirs) ? DF.getFoldersTrees(dirs, depth) : DF.left(err(`dirs please`))),
      DF.map(trees => pipe(trees, NA.map(showTree), _ => _.join('\n'))),
    )
  }

  const opts = { showDocwsid: false, showDrivewsid: listInfo, showEtag: etag, showHeader: header }

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

  return pipe(
    DF.getCachedRoot(trash),
    DF.chain(root =>
      cached
        ? DF.getByPathsCached(root, npaths)
        : DF.getByPathsH(root, npaths)
    ),
    SRTE.map(raw ? showRaw : showConsole),
  )
}
