import * as A from 'fp-ts/lib/Array'
import { identity, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import micromatch from 'micromatch'
import { Drive } from '../../../../icloud/drive'
import {
  addPathToFolderTree,
  showTreeWithFiles,
  treeWithFiles,
} from '../../../../icloud/drive/drive-methods/drive-get-folders-trees'
import { normalizePath } from '../../../../util/normalize-path'
import { Path } from '../../../../util/path'
import { filterTree } from '../../../../util/tree'

export const recursivels = ({ paths, depth, tree, cached }: {
  paths: NA.NonEmptyArray<string>
  depth: number
  tree: boolean
  cached: boolean
}) => {
  const scanned = pipe(
    paths,
    NA.map(micromatch.scan),
    NA.map(scan =>
      scan.isGlob
        ? scan
        : micromatch.scan(Path.join(scan.base, '**/*'))
    ),
  )

  const basepaths = pipe(scanned, NA.map(_ => _.base), NA.map(normalizePath))

  if (tree) {
    return pipe(
      Drive.getCachedDocwsRoot(),
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
            showTreeWithFiles,
          ),
        )
      )),
      SRTE.map(_ => _.join('\n\n')),
    )
  }

  return pipe(
    Drive.searchGlobs(pipe(scanned, NA.map(_ => _.input)), depth),
    SRTE.map(NA.map(A.map(_ => _.path))),
    SRTE.map(NA.map(_ => _.join('\n'))),
    SRTE.map(_ => _.join('\n\n')),
  )
}
