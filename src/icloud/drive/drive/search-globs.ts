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
import * as DF from '../drive'
import { fileName } from '../requests/types/types'
import * as T from '../requests/types/types'
import { FolderTree, FolderTreeValue, getFoldersTrees } from './get-folders-trees'
import { modifySubset } from './modify-subset'

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
    DF.chainRoot(root => DF.getByPaths(root, basepaths)),
    SRTE.chain((bases) =>
      pipe(
        modifySubset(
          bases,
          T.isNotFileG,
          (bases) =>
            pipe(
              getFoldersTrees(bases, 256),
              SRTE.map(NA.map(E.of)),
            ),
          (base) => E.left(base),
        ),
      )
    ),
    SRTE.map(flow(NA.zip(basepaths), NA.zip(globs), NA.zip(scanned))),
    SRTE.map(flow(NA.map(([[[fileOrTree, basepath], globpattern], scan]) =>
      pipe(
        fileOrTree,
        E.fold(
          file =>
            scan.base == scan.input
              ? [{ path: scan.base, item: file }]
              : [],
          tree =>
            pipe(
              zipWithPath(Path.dirname(basepath), tree),
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
}

const zipWithPath = <T extends T.Details>(
  parentPath: string,
  tree: FolderTree<T>,
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

  const subfolders = pipe(
    tree.forest,
    A.map(t => zipWithPath(path, t)),
    A.flatten,
  )

  return [
    [path, tree.value.details],
    ...subfolders,
    ...zippedsubfiles,
  ]
}
