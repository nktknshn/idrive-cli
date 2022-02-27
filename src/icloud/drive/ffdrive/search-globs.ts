import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TR from 'fp-ts/lib/Tree'
import * as O from 'fp-ts/Option'
import micromatch from 'micromatch'
import { normalizePath } from '../../../cli/cli-drive/cli-drive-actions/helpers'
import { NEA } from '../../../lib/types'
import { Path } from '../../../lib/util'
import * as DF from '../ffdrive'
import { fileName } from '../requests/types/types'
import * as T from '../requests/types/types'
import { modifySubsetDF } from './modify-subset'
import { FolderTree, FolderTreeValue, getFoldersRecursivelyD } from './recursive'

const fullPathTree = (
  parentPath: string,
  tree: FolderTree,
): string[] => {
  const name = fileName(tree.value.details)
  const path = Path.join(parentPath, name)

  const res = [
    path,
    ...pipe(
      tree.value.details.items,
      A.map(fileName),
      A.map(f => Path.join(path, f)),
    ),
    ...pipe(
      tree.forest,
      A.map(v => fullPathTree(path, v)),
      A.flatten,
    ),
  ]

  return res
}
const zipWithPath = (
  parentPath: string,
  tree: FolderTree,
): TR.Tree<FolderTreeValue<T.Details> & { path: string }> => {
  const name = fileName(tree.value.details)
  const path = Path.join(parentPath, name)

  const res = TR.make(
    { ...tree.value, path },
    pipe(
      tree.forest,
      A.map(v => zipWithPath(path, v)),
    ),
  )

  return res
}
const zipWithPath2 = (
  parentPath: string,
  tree: FolderTree,
): [string, DF.DetailsOrFile<T.DetailsDocwsRoot | T.DetailsTrash>][] => {
  const name = fileName(tree.value.details)
  const path = Path.join(parentPath, name) + '/'

  const subfiles = pipe(
    tree.value.details.items,
    A.filter(T.isFile),
  )

  const zippedsubfiles = pipe(
    subfiles,
    A.map(fileName),
    A.map(f => Path.join(path, f)),
    A.zip(subfiles),
  )

  // const subfolders = pipe(
  //   tree.value.details.items,
  //   A.filter(T.isFolderLikeItem),
  // )
  const subfolders = pipe(
    tree.forest,
    A.map(t => zipWithPath2(path, t)),
    A.flatten,
  )

  return [
    [path, tree.value.details],
    ...subfolders,
    ...zippedsubfiles,
  ]
}
export const searchGlobs = (
  globs: NEA<string>,
): DF.DriveM<
  NA.NonEmptyArray<
    { path: string; item: DF.DetailsOrFile<T.DetailsDocwsRoot | T.DetailsTrash> }[]
  >
> => {
  const scanned = pipe(globs, NA.map(micromatch.scan))
  const basepaths = pipe(scanned, NA.map(_ => _.base), NA.map(normalizePath))

  return pipe(
    DF.Do,
    SRTE.bind('bases', () =>
      pipe(
        DF.chainRoot(root => DF.getByPathsE(root, basepaths)),
      )),
    SRTE.chain(({ bases }) =>
      pipe(
        modifySubsetDF(
          bases,
          DF.isNotFileG,
          (bases) =>
            pipe(
              getFoldersRecursivelyD(bases, 256),
              DF.map(NA.map(E.of)),
            ),
          (base) => E.left(base),
        ),
        DF.map(flow(NA.zip(basepaths), NA.zip(globs), NA.zip(scanned))),
        DF.map(flow(NA.map(([[[fileOrTree, basepath], globpattern], scan]) =>
          pipe(
            fileOrTree,
            E.fold(
              (file) =>
                scan.base == scan.input
                  ? [{ path: scan.base, item: file }]
                  : [],
              // ? `${globpattern}:\n${scan.base}` + '\n'
              // : `${globpattern}: ${basepath} is a file` + '\n',
              tree =>
                pipe(
                  zipWithPath2(Path.dirname(basepath), tree),
                  A.filterMap(([path, item]) => {
                    return micromatch.match([path], globpattern).length > 0
                      ? O.some({ path, item })
                      : O.none
                  }),
                ),
            ),
          )
        ))),
      )
    ),
  )
}
