import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { logger } from '../../../../logging/logging'
import { err } from '../../../../util/errors'
import { NormalizedPath } from '../../../../util/normalize-path'
import { NEA } from '../../../../util/types'
import { sequenceNArrayE } from '../../../../util/util'
import * as T from '../../../drive-types'
import * as V from '../../../util/get-by-path-types'
import { filterOrElse, Lookup, map } from '../..'
import { ItemIsNotFolderError } from '../../errors'
import { chainCachedDocwsRoot, chainCachedTrash, getCachedDocwsRoot } from '../get-roots'
import { defaultParams, getByPaths } from './get-by-paths'

/** Fails if the path is not valid */
export const getByPathStrict = <R extends T.Root>(
  root: R,
  path: NormalizedPath,
  params = defaultParams,
): Lookup<T.DetailsOrFile<R>> => {
  return pipe(
    getByPathsStrict(root, [path], params),
    map(NA.head),
  )
}

/** Fails if some of the paths are not valid */
export const getByPathsStrict = <R extends T.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
  params = defaultParams,
): Lookup<NEA<T.DetailsOrFile<R>>> => {
  return pipe(
    getByPaths(root, paths, params),
    SRTE.map(NA.map(
      V.asEither((res) => err(V.showGetByPathResult(res))),
    )),
    SRTE.chainEitherK(sequenceNArrayE),
  )
}

export const getByPathStrictDocwsroot = (
  path: NormalizedPath,
  params = defaultParams,
): Lookup<T.DetailsOrFile<T.DetailsDocwsRoot>> => {
  return pipe(
    getByPathsStrictDocwsroot([path], params),
    map(NA.head),
  )
}

/** Fails if some of the paths are not valid */
export const getByPathsStrictDocwsroot = (
  paths: NEA<NormalizedPath>,
  params = defaultParams,
): Lookup<NEA<T.DetailsOrFile<T.DetailsDocwsRoot>>> => {
  return pipe(
    chainCachedDocwsRoot(root => getByPaths(root, paths, params)),
    SRTE.map(NA.map(
      V.asEither((res) => err(V.showGetByPathResult(res))),
    )),
    SRTE.chainEitherK(sequenceNArrayE),
  )
}

export const getByPathsStrictTrash = (
  path: NEA<NormalizedPath>,
  params = defaultParams,
): Lookup<NEA<T.DetailsOrFile<T.DetailsTrashRoot>>> => {
  return pipe(
    chainCachedTrash(root => getByPaths(root, path, params)),
    SRTE.map(NA.map(
      V.asEither((res) => err(V.showGetByPathResult(res))),
    )),
    SRTE.chainEitherK(sequenceNArrayE),
  )
}

export const getByPathStrictTrash = (
  path: NormalizedPath,
  params = defaultParams,
): Lookup<T.DetailsOrFile<T.DetailsTrashRoot>> => {
  return pipe(
    getByPathsStrictTrash([path], params),
    map(NA.head),
  )
}

export const getByPathFolderStrict = <R extends T.Root>(
  root: R,
  path: NormalizedPath,
  params = defaultParams,
): Lookup<R | T.NonRootDetails> =>
  pipe(
    getByPathsStrict(root, [path], params),
    map(NA.head),
    filterOrElse(
      T.isDetailsG,
      () => ItemIsNotFolderError.create(`${path} is not a folder.`),
    ),
  )

export const getByPathFolderStrictDocwsroot = (
  path: NormalizedPath,
  params = defaultParams,
): Lookup<T.DetailsDocwsRoot | T.NonRootDetails> =>
  pipe(
    getCachedDocwsRoot(),
    SRTE.chainW((root) => getByPathFolderStrict(root, path, params)),
  )

/** Fails if some of the paths are not valid or not folders */
export const getByPathsFoldersStrict = <R extends T.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
  params = defaultParams,
): Lookup<NEA<R | T.NonRootDetails>> =>
  pipe(
    getByPathsStrict(root, paths, params),
    filterOrElse(
      (items): items is NEA<R | T.NonRootDetails> => A.every(T.isDetailsG)(items),
      () => ItemIsNotFolderError.create(`some of the paths are not folders`),
    ),
  )

export const getByPathsFoldersStrictDocwsroot = (
  paths: NEA<NormalizedPath>,
  params = defaultParams,
): Lookup<NEA<T.DetailsDocwsRoot | T.NonRootDetails>> =>
  pipe(
    chainCachedDocwsRoot(
      root => getByPathsFoldersStrict(root, paths, params),
    ),
  )

export const getByPath = <R extends T.Root>(
  root: R,
  path: NormalizedPath,
  params = defaultParams,
): Lookup<V.Result<R>> => {
  return pipe(
    getByPaths(root, [path], params),
    map(NA.head),
  )
}

export const getByPathsDocwsroot = (
  paths: NEA<NormalizedPath>,
  params = defaultParams,
): Lookup<NEA<V.Result<T.DetailsDocwsRoot>>> => {
  logger.debug('getByPathsDocwsroot')
  return pipe(
    chainCachedDocwsRoot(root => getByPaths(root, paths, params)),
  )
}

export const getByPathDocwsroot = (
  path: NormalizedPath,
  params = defaultParams,
): Lookup<V.Result<T.DetailsDocwsRoot>> => {
  return pipe(
    getByPathsDocwsroot([path], params),
    map(NA.head),
  )
}
