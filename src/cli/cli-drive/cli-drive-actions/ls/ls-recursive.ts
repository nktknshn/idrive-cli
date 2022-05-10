import * as A from 'fp-ts/lib/Array'
import { identity, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import micromatch from 'micromatch'
import { DriveLookup } from '../../../../icloud-drive'
import { usingTempCache } from '../../../../icloud-drive/drive-lookup'
import { addPathToFolderTree, showTreeWithFiles, treeWithFiles } from '../../../../icloud-drive/util/drive-folder-tree'
import { normalizePath } from '../../../../util/normalize-path'
import { Path } from '../../../../util/path'
import { filterTree } from '../../../../util/tree'

export const recursivels = ({ paths, depth, tree, cached }: {
  paths: NA.NonEmptyArray<string>
  depth: number
  tree: boolean
  cached: boolean
}): SRTE.StateReaderTaskEither<DriveLookup.State, DriveLookup.Deps, Error, string> => {
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
      DriveLookup.getCachedDocwsRoot(),
      SRTE.bindTo('root'),
      SRTE.chain(
        ({ root }) => DriveLookup.getByPathsFoldersStrict(root, basepaths),
      ),
      SRTE.chain(dirs => DriveLookup.getFoldersTrees(dirs, depth)),
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
    DriveLookup.searchGlobs(pipe(scanned, NA.map(_ => _.input)), depth),
    usingTempCache,
    SRTE.map(NA.map(A.map(_ => _.path))),
    SRTE.map(NA.map(_ => _.join('\n'))),
    SRTE.map(_ => _.join('\n\n')),
  )
}
