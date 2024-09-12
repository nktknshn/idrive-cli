import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import { snd } from 'fp-ts/lib/ReadonlyTuple'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import micromatch from 'micromatch'

import { loggerIO } from '../../../logging'
import { SrteUtils } from '../../../util'
import { isGlobstar, isMatching } from '../../../util/glob-matching'
import { guardSnd } from '../../../util/guards'
import { normalizePath, Path } from '../../../util/path'
import { NEA } from '../../../util/types'
import { DriveLookup, DriveTree, Types } from '../..'
import * as DTR from '../../util/drive-folder-tree'
import { modifySubset } from '../../util/drive-modify-subset'
import { getFoldersTrees } from './drive-get-folders-trees'

export type SearchGlobFoundItem = {
  /** Matching path */
  path: string
  /** Item data */
  item:
    // a root
    | Types.DetailsDocwsRoot
    | Types.DetailsTrashRoot
    // info about a folder
    | Types.DetailsFolder
    | Types.DetailsAppLibrary
    // if the depth is not enough the get a folder details
    // item from the parent's details is returned
    | Types.DriveChildrenItemFolder
    | Types.DriveChildrenItemAppLibrary
    // a file
    | Types.DriveChildrenItemFile
}

export type SearchGlobsParams = {
  options?: micromatch.Options
  /** If true, automatically go deeper into folders */
  goDeeper?: boolean
}

/** Recursively searches for files and folders matching the glob patterns.
 * `micromatch` is used for matching. */
export const searchGlobs = (
  /**  globs might be plain paths (folders/files), wildcards (like /test/*.txt)
   * or glob patterns (like **\/*) */
  globs: NEA<string>,
  depth = Infinity,
  {
    options,
    goDeeper = false,
    // cached = false,
  }: SearchGlobsParams,
): DriveLookup.Lookup<
  NA.NonEmptyArray<SearchGlobFoundItem[]>
> => {
  const scanned = pipe(globs, NA.map(micromatch.scan))

  // base folder for each glob
  const globsBases = pipe(
    scanned,
    // for globs starting with ** prepend a slash
    NA.map(_ => _.base === '' ? '/' : _.base),
    NA.map(normalizePath),
  )

  const handleBases = (
    fileOrTree: E.Either<
      // it's actually Types.DriveChildrenItemFile but type inference didn't work
      Types.DetailsOrFile<Types.DetailsDocwsRoot>,
      // tree of globs base paths
      DriveTree.DriveFolderTree<Types.DetailsDocwsRoot>
    >,
    // input glob
    glob: string,
    // glob's scan info
    scan: micromatch.ScanInfo,
    // base path
    basepath: string,
  ) =>
    pipe(
      fileOrTree,
      E.fold(
        // handle paths that turned out to be files
        file =>
          // if the input glob is a plain path to a file, just compare the paths
          !scan.isGlob && isMatching(basepath, glob, options)
            ? [{ path: basepath, item: file }]
            : // otherwise it's an invalid path like /test.txt/**
              [],
        // handle trees
        flow(
          DriveTree.flattenTreeWithItemsDocwsroot(Path.dirname(basepath)),
          A.filter(
            ({ path }) =>
              scan.isGlob
                ? isMatching(path, glob, options)
                : goDeeper
                // if this is a clean folder path and `goDeeper` is true, append ** to the glob
                // to match all the nested items
                ? isMatching(path, Path.join(glob, '**'), options)
                : isMatching(path, glob, options),
          ),
        ),
      ),
    )

  return pipe(
    // look for the paths leading the glob patterns and get the details
    DriveLookup.getByPathsStrictDocwsroot(globsBases),
    SRTE.chain((globsBases) =>
      // separate input paths into folders and files
      modifySubset(
        NA.zip(globsBases)(scanned),
        guardSnd(Types.isDetailsG),
        (dirs) =>
          // separate globstars from other paths (like plain paths and wildcards)
          modifySubset(
            dirs, // `dirs` is a list of folders details
            ([scan, _dir]) => isGlobstar(scan.input) || (!scan.isGlob && goDeeper),
            // go deeper recursively getting content of the parents of globstars
            // go deep into plain paths if enabled,
            globParents =>
              pipe(
                getFoldersTrees(pipe(globParents, NA.map(snd)), depth),
                SRTE.map(NA.map(E.of)),
              ),
            // return details of the folders that do not require deeper lookup
            ([_scan, dir]) => E.of(DTR.shallowFolder(dir)),
          ),
        // file goes as is
        ([_scan, file]) => E.left(file),
      )
    ),
    // execute `getByPathsStrictDocwsroot` and `getFoldersTrees` with temp cache to save api calls
    DriveLookup.usingTempCache,
    // zip all the data together
    SRTE.map(flow(NA.zip(globs), NA.zip(scanned), NA.zip(globsBases))),
    SRTE.map(
      NA.map(
        ([[[fileOrTree, glob], scan], basepath]) => handleBases(fileOrTree, glob, scan, basepath),
      ),
    ),
    SrteUtils.runLogging(loggerIO.debug(`searchGlobs(${globs})`)),
  )
}
