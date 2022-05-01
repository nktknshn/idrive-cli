import * as IO from 'fp-ts/IO'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { snd } from 'fp-ts/lib/ReadonlyTuple'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import micromatch from 'micromatch'
import { guardSnd } from '../../../../util/guards'
import { logg, logger } from '../../../../util/logging'
import { normalizePath } from '../../../../util/normalize-path'
import { Path } from '../../../../util/path'
import { NEA } from '../../../../util/types'
import { Query } from '../..'
import * as T from '../../drive-api/icloud-drive-types'
import { modifySubset } from '../../modify-subset'
import { flattenFolderTreeWithPath, getFoldersTrees, shallowFolder, showFolderTree } from './drive-get-folders-trees'

export type SearchGlobFoundItem = {
  path: string
  item: T.DetailsOrFile<T.DetailsDocwsRoot | T.DetailsTrashRoot>
}

export const searchGlobsShallow = (
  globs: NEA<string>,
): Query.Effect<
  NA.NonEmptyArray<SearchGlobFoundItem[]>
> => {
  return searchGlobs(globs, 0)
}

export const searchGlobs = (
  globs: NEA<string>,
  depth = Infinity,
): Query.Effect<
  NA.NonEmptyArray<SearchGlobFoundItem[]>
> => {
  const scanned = pipe(globs, NA.map(micromatch.scan))
  const basepaths = pipe(scanned, NA.map(_ => normalizePath(_.base)))

  return pipe(
    Query.chainCachedDocwsRoot(
      root => Query.getByPathsStrict(root, basepaths),
    ),
    SRTE.chain((bases) =>
      modifySubset(
        NA.zip(bases)(scanned),
        guardSnd(T.isNotFile),
        (dirs) =>
          modifySubset(
            dirs,
            ([scan, dir]) => scan.isGlob,
            // recursively get content for globs
            parents =>
              pipe(
                getFoldersTrees(pipe(parents, NA.map(snd)), depth),
                SRTE.map(NA.map(E.of)),
              ),
            ([scan, dir]) => E.of(shallowFolder(dir)),
          ),
        ([scan, file]) => E.left(file),
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
          tree => {
            return pipe(
              tree,
              flattenFolderTreeWithPath(Path.dirname(scan.base)),
              A.filterMap(([path, item]) => {
                if (scan.glob.length == 0) {
                  if (normalizePath(path) == normalizePath(globpattern)) {
                    return O.some({ path, item })
                  }
                  return O.none
                }

                return micromatch.isMatch(
                    path.replace(/^\//, ''),
                    globpattern.replace(/^\//, ''),
                  )
                  ? O.some({ path, item })
                  : O.none
              }),
            )
          },
        ),
      )
    ))),
  )
}
