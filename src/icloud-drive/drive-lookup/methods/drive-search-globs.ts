import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { snd } from 'fp-ts/lib/ReadonlyTuple'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as O from 'fp-ts/Option'
import micromatch from 'micromatch'

import { guardSnd } from '../../../util/guards'
import { normalizePath, Path } from '../../../util/path'
import { NEA } from '../../../util/types'
import { DriveLookup } from '../..'
import * as T from '../../drive-types'
import * as DTR from '../../util/drive-folder-tree'
import { modifySubset } from '../../util/drive-modify-subset'
import { getFoldersTrees } from './drive-get-folders-trees'

export type SearchGlobFoundItem = {
  path: string
  item: T.DetailsOrFile<T.DetailsDocwsRoot | T.DetailsTrashRoot>
}

export const searchGlobsShallow = (
  globs: NEA<string>,
): DriveLookup.Lookup<
  NA.NonEmptyArray<SearchGlobFoundItem[]>
> => {
  return searchGlobs(globs, 0)
}

/** Recursively searches for files and folders matching the glob patterns */
export const searchGlobs = (
  globs: NEA<string>,
  depth = Infinity,
  options?: micromatch.Options,
): DriveLookup.Lookup<
  NA.NonEmptyArray<SearchGlobFoundItem[]>
> => {
  const scanned = pipe(globs, NA.map(micromatch.scan))
  const basepaths = pipe(scanned, NA.map(_ => normalizePath(_.base)))

  return pipe(
    // look for the paths leading the glob patterns and get the details
    DriveLookup.getByPathsStrictDocwsroot(basepaths),
    SRTE.chain((globsBases) =>
      modifySubset(
        NA.zip(globsBases)(scanned),
        // separate folders and files
        guardSnd(T.isNotFile),
        (dirs) =>
          modifySubset(
            dirs,
            // separate globs and plain paths
            ([scan, _dir]) => scan.isGlob,
            // recursively get content of the parents of globs
            globParents =>
              pipe(
                getFoldersTrees(pipe(globParents, NA.map(snd)), depth),
                SRTE.map(NA.map(E.of)),
              ),
            // return the details of the folders that are not globs
            // like /folder1/*.txt /folder1/
            ([_scan, dir]) => E.of(DTR.shallowFolder(dir)),
          ),
        ([_scan, file]) => E.left(file),
      )
    ),
    // execute `getByPathsStrictDocwsroot` and `getFoldersTrees` with temp cache to save api calls
    DriveLookup.usingTempCache,
    SRTE.map(flow(NA.zip(globs), NA.zip(scanned), NA.zip(basepaths))),
    SRTE.map(flow(NA.map(([[[fileOrTree, globpattern], scan], basepath]) =>
      pipe(
        fileOrTree,
        E.fold(
          // handle basepaths that turned out to be files
          file =>
            !scan.isGlob && micromatch.isMatch(basepath, scan.input, options)
              ? [{ path: basepath, item: file }]
              : [],
          // handle trees
          tree => {
            return pipe(
              tree,
              DTR.flattenFolderTreeWithBasepath(Path.dirname(scan.base)),
              A.filterMap(({ remotepath, remotefile }) => {
                if (scan.glob.length == 0) {
                  if (micromatch.isMatch(remotepath, globpattern, options)) {
                    return O.some({ path: remotepath, item: remotefile })
                  }

                  return O.none
                }

                return micromatch.isMatch(
                    remotepath.replace(/^\//, ''),
                    globpattern.replace(/^\//, ''),
                    options,
                  )
                  ? O.some({ path: remotepath, item: remotefile })
                  : O.none
              }),
            )
          },
        ),
      )
    ))),
  )
}
