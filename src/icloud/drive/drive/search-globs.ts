import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { snd } from 'fp-ts/lib/ReadonlyTuple'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import micromatch, { ScanInfo } from 'micromatch'
import { normalizePath } from '../../../cli/cli-drive/cli-drive-actions/helpers'
import { NEA } from '../../../lib/types'
import { Path } from '../../../lib/util'
import * as DF from '../drive'
import { guardSnd } from '../helpers'
import * as T from '../requests/types/types'
import { getFoldersTrees, shallowFolder, zipFolderTreeWithPath } from './get-folders-trees'
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
    SRTE.chain((bases) => {
      return modifySubset(
        NA.zip(bases)(scanned),
        guardSnd(T.isNotFileG),
        (dirs) =>
          modifySubset(
            dirs,
            ([scan]) => scan.isGlob,
            globs =>
              pipe(
                getFoldersTrees(pipe(globs, NA.map(snd)), Infinity),
                SRTE.map(NA.map(E.of)),
              ),
            dir => E.of(shallowFolder(dir[1])),
          ),
        (base) => E.left(base[1]),
      )
    }),
    SRTE.map(flow(NA.zip(globs), NA.zip(scanned))),
    SRTE.map(flow(NA.map(([[fileOrTree, globpattern], scan]) =>
      pipe(
        fileOrTree,
        E.fold(
          file =>
            !scan.isGlob
              ? [{ path: scan.base, item: file }]
              : [],
          tree =>
            pipe(
              zipFolderTreeWithPath(Path.dirname(scan.base), tree),
              A.filterMap(([path, item]) => {
                if (scan.glob.length == 0) {
                  if (normalizePath(path) == normalizePath(globpattern)) {
                    return O.some({ path, item })
                  }
                  return O.none
                }

                return micromatch.isMatch(path, globpattern)
                  ? O.some({ path, item })
                  : O.none
              }),
            ),
        ),
      )
    ))),
  )
}
