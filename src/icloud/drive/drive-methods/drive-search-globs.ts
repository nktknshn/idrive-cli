import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { snd } from 'fp-ts/lib/ReadonlyTuple'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import micromatch from 'micromatch'
import { normalizePath } from '../../../util/normalize-path'
import { NEA } from '../../../util/types'
import { guardSnd, Path } from '../../../util/util'
import { Drive } from '..'
import { modifySubset } from '../modify-subset'
import * as T from '../types'
import { flattenFolderTreeWithPath, getFoldersTrees, shallowFolder } from './drive-get-folders-trees'

export type SearchGlobFoundItem = { path: string; item: T.DetailsOrFile<T.DetailsDocwsRoot | T.DetailsTrashRoot> }

export const searchGlobsShallow = (
  globs: NEA<string>,
): Drive.Effect<
  NA.NonEmptyArray<SearchGlobFoundItem[]>
> => {
  return searchGlobs(globs, 0)
}

export const searchGlobs = (
  globs: NEA<string>,
  depth = Infinity,
): Drive.Effect<
  NA.NonEmptyArray<SearchGlobFoundItem[]>
> => {
  const scanned = pipe(globs, NA.map(micromatch.scan))
  const basepaths = pipe(scanned, NA.map(_ => _.base), NA.map(normalizePath))

  return pipe(
    Drive.chainCachedDocwsRoot(
      root => Drive.getByPathsStrict(root, basepaths),
    ),
    SRTE.chain((bases) =>
      modifySubset(
        NA.zip(bases)(scanned),
        guardSnd(T.isNotFile),
        (dirs) =>
          modifySubset(
            dirs,
            ([scan]) => scan.isGlob,
            // recursively get content for globs
            globs =>
              pipe(
                getFoldersTrees(pipe(globs, NA.map(snd)), depth),
                SRTE.map(NA.map(E.of)),
              ),
            dir => E.of(shallowFolder(dir[1])),
          ),
        (base) => E.left(base[1]),
      )
    ),
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
              tree,
              flattenFolderTreeWithPath(Path.dirname(scan.base)),
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
