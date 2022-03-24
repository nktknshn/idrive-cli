import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { snd } from 'fp-ts/lib/ReadonlyTuple'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import micromatch from 'micromatch'
import { normalizePath } from '../../../lib/normalize-path'
import { NEA } from '../../../lib/types'
import { guardSnd, Path } from '../../../lib/util'
import { Drive } from '..'
import { modifySubset } from '../modify-subset'
import * as T from '../types'
import { getFoldersTrees, shallowFolder, zipFolderTreeWithPath } from './get-folders-trees'

export const searchGlobsShallow = (
  globs: NEA<string>,
): Drive.Effect<
  NA.NonEmptyArray<
    { path: string; item: T.DetailsOrFile<T.DetailsDocwsRoot | T.DetailsTrash> }[]
  >
> => {
  return searchGlobs(globs, 0)
}

export const searchGlobs = (
  globs: NEA<string>,
  depth = Infinity,
): Drive.Effect<
  NA.NonEmptyArray<
    { path: string; item: T.DetailsOrFile<T.DetailsDocwsRoot | T.DetailsTrash> }[]
  >
> => {
  const scanned = pipe(globs, NA.map(micromatch.scan))
  const basepaths = pipe(scanned, NA.map(_ => _.base), NA.map(normalizePath))

  return pipe(
    Drive.chainCachedDocwsRoot(
      root => Drive.getByPathsStrict(root, basepaths),
    ),
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
                getFoldersTrees(pipe(globs, NA.map(snd)), depth),
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
