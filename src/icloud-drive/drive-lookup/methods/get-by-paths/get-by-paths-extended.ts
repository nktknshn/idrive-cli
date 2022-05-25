import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { err } from '../../../../util/errors'
import { logger } from '../../../../util/logging'
import { NormalizedPath } from '../../../../util/normalize-path'
import { NEA } from '../../../../util/types'
import { sequenceArrayNEA } from '../../../../util/util'
import * as T from '../../../icloud-drive-items-types'
import * as V from '../../../util/get-by-path-types'
import { Effect, filterOrElse, map } from '../..'
import { ItemIsNotFolderError } from '../../errors'
import { chainCachedDocwsRoot, getCachedDocwsRoot } from '../get-roots'
import { getByPaths } from './get-by-paths'

/** fails if some of the paths are not valid */
export const getByPathsStrict = <R extends T.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
): Effect<NEA<T.DetailsOrFile<R>>> => {
  return pipe(
    getByPaths(root, paths),
    SRTE.map(NA.map(
      V.asEither((res) => err(V.showGetByPathResult(res))),
    )),
    SRTE.chainEitherK(sequenceArrayNEA),
  )
}

export const getByPathsStrictDocwsroot = (
  paths: NEA<NormalizedPath>,
): Effect<NEA<T.DetailsOrFile<T.DetailsDocwsRoot>>> => {
  return pipe(
    chainCachedDocwsRoot(root => getByPaths(root, paths)),
    SRTE.map(NA.map(
      V.asEither((res) => err(V.showGetByPathResult(res))),
    )),
    SRTE.chainEitherK(sequenceArrayNEA),
  )
}

export const getByPathFolderStrict = <R extends T.Root>(
  root: R,
  path: NormalizedPath,
): Effect<R | T.NonRootDetails> =>
  pipe(
    getByPathsStrict(root, [path]),
    map(NA.head),
    filterOrElse(
      T.isDetailsG,
      () => ItemIsNotFolderError.create(`${path} is not a folder`),
    ),
  )

export const getByPathFolderStrictDocwsroot = (
  path: NormalizedPath,
): Effect<T.DetailsDocwsRoot | T.NonRootDetails> =>
  pipe(
    getCachedDocwsRoot(),
    SRTE.chainW((root) => getByPathFolderStrict(root, path)),
  )

export const getByPathsFoldersStrict = <R extends T.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
): Effect<NEA<R | T.NonRootDetails>> =>
  pipe(
    getByPathsStrict(root, paths),
    filterOrElse(
      (items): items is NEA<R | T.NonRootDetails> => A.every(T.isDetailsG)(items),
      () => ItemIsNotFolderError.create(`some of the paths are not folders`),
    ),
  )

export const getByPathsFoldersStrictDocwsroot = (
  paths: NEA<NormalizedPath>,
): Effect<NEA<T.DetailsDocwsRoot | T.NonRootDetails>> =>
  pipe(
    chainCachedDocwsRoot(
      root => getByPathsFoldersStrict(root, paths),
    ),
  )

export const getByPath = <R extends T.Root>(root: R, path: NormalizedPath): Effect<V.GetByPathResult<R>> => {
  return pipe(
    getByPaths(root, [path]),
    map(NA.head),
  )
}

export const getByPathsDocwsroot = (paths: NEA<NormalizedPath>): Effect<NEA<V.GetByPathResult<T.DetailsDocwsRoot>>> => {
  logger.debug('getByPathsDocwsroot')
  return pipe(
    chainCachedDocwsRoot(root => getByPaths(root, paths)),
  )
}

export const getByPathDocwsroot = (path: NormalizedPath): Effect<V.GetByPathResult<T.DetailsDocwsRoot>> => {
  return pipe(
    getByPathsDocwsroot([path]),
    map(NA.head),
  )
}
