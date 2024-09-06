import { identity, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TR from 'fp-ts/lib/Tree'
import * as O from 'fp-ts/Option'
import micromatch from 'micromatch'

import { isMatching } from '../../../util/glob-matching'
import { addLeadingSlash, normalizePath } from '../../../util/normalize-path'
import { Path } from '../../../util/path'
import * as TreeUtil from '../../../util/tree'
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
        : micromatch.scan(Path.join(scan.base, '**'))
    ),
  )

/** List paths recursively. Globs are supported */
export const listRecursive = ({ globs, depth }: {
  globs: NA.NonEmptyArray<string>
  depth: number
  cached: boolean
}): DriveLookup.Lookup<NEA<DriveLookup.SearchGlobFoundItem[]>> => {
  // appends '**' to the paths that are not globs to make a recursive search
  const scanned = getScanned(globs)
  globs = pipe(scanned, NA.map(_ => _.input))

  return DriveLookup.searchGlobs(globs, depth)
}

export type ListRecursiveTreeResult = O.Option<
  TR.Tree<{
    item: DriveTree.TreeWithItemsValue<Types.DetailsDocwsRoot>
    path: string
  }>
>

export const listRecursiveTree = (
  // globs might be plain paths (folders), wildcards (like /test/*.txt) or glob patterns (like **/*.txt)
  { globs, depth }: { globs: NA.NonEmptyArray<string>; depth: number },
): DriveLookup.Lookup<NEA<ListRecursiveTreeResult>, DriveLookup.Deps> => {
  const scanned = getScanned(globs)
  const basepaths = pipe(
    scanned,
    // for globs starting with **
    NA.map(_ => _.base),
    NA.map(normalizePath),
  )

  return pipe(
    DriveLookup.getFoldersTreesByPathsDocwsroot(basepaths, depth),
    SRTE.map(NA.zip(scanned)),
    SRTE.map(NA.zip(basepaths)),
    SRTE.map(NA.map(([[tree, scan], basepath]) =>
      pipe(
        DriveTree.treeWithItems(tree),
        DriveTree.addPath(Path.dirname(basepath), identity),
        TreeUtil.filterTree(_ => isMatching(_.path, scan.input)),
      )
    )),
  )
}
