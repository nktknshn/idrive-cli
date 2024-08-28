import { identity, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TR from 'fp-ts/lib/Tree'
import * as O from 'fp-ts/Option'
import micromatch from 'micromatch'

import { addLeadingSlash, normalizePath } from '../../../util/normalize-path'
import { Path } from '../../../util/path'
import * as Tree from '../../../util/tree'
import { NEA } from '../../../util/types'
import { DriveLookup, Types } from '../..'
import * as DriveTree from '../../util/drive-folder-tree'

const getScanned = (paths: NA.NonEmptyArray<string>) =>
  pipe(
    paths,
    NA.map(addLeadingSlash),
    NA.map(micromatch.scan),
    NA.map(scan =>
      scan.isGlob
        ? scan
        : micromatch.scan(Path.join(scan.base, '**/*'))
    ),
  )

export type ListRecursiveTreeResult = O.Option<
  TR.Tree<{
    item: Types.DriveChildrenItemFile | Types.DetailsOrRoot<Types.DetailsDocwsRoot>
    path: string
  }>
>

export const listRecursiveTree = (
  { paths, depth }: { paths: NA.NonEmptyArray<string>; depth: number },
): DriveLookup.Lookup<NEA<ListRecursiveTreeResult>, DriveLookup.Deps> => {
  const scanned = getScanned(paths)
  const basepaths = pipe(scanned, NA.map(_ => _.base), NA.map(normalizePath))

  return pipe(
    DriveLookup.getFoldersTreesByPathsDocwsroot(basepaths, depth),
    SRTE.map(NA.zip(scanned)),
    SRTE.map(NA.map(([tree, scan]) =>
      pipe(
        DriveTree.treeWithFiles(tree),
        DriveTree.addPathToFolderTree(Path.dirname(scan.base), identity),
        Tree.filterTree(_ => micromatch.isMatch(_.path, scan.input)),
      )
    )),
  )
}

export const listRecursive = ({ paths, depth }: {
  paths: NA.NonEmptyArray<string>
  depth: number
}): DriveLookup.Lookup<NEA<DriveLookup.SearchGlobFoundItem[]>> => {
  const scanned = getScanned(paths)
  return pipe(
    DriveLookup.searchGlobs(pipe(scanned, NA.map(_ => _.input)), depth),
  )
}
