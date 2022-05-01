import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { err } from '../../../../../util/errors'
import { NormalizedPath } from '../../../../../util/normalize-path'
import { NEA } from '../../../../../util/types'
import { sequenceArrayNEA } from '../../../../../util/util'
import * as T from '../../../drive-api/icloud-drive-types'
import { filterOrElse, map } from '../..'
import { Effect } from '../..'
import * as C from '../../cache/cache'
import { GetByPathResult, pathTarget } from '../../cache/cache-get-by-path-types'
import * as V from '../../cache/cache-get-by-path-types'
import { ItemIsNotFolderError, NotFoundError } from '../../errors'
import { asksCache, chainCache } from '../cache-methods'
import { chainCachedDocwsRoot } from '../roots'
import { getByPaths } from './get-by-paths'

/** fails if some of the paths are not valid */
export const getByPathsStrict = <R extends T.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
): Effect<NEA<T.DetailsOrFile<R>>> => {
  return pipe(
    getByPaths(root, paths),
    SRTE.map(NA.map(
      V.asEither(
        (res) =>
          err(
            V.showGetByPathResult(res),
            // `error: ${res.error}. validPart=${res.details.map(T.fileName)} rest=[${res.rest}]`,
          ),
      ),
    )),
    SRTE.chainEitherK(sequenceArrayNEA),
  )
}

export const getByPathFolder = <R extends T.Root>(
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

export const getByPathsFolders = <R extends T.Root>(
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

export const getByPath = <R extends T.Root>(root: R, path: NormalizedPath): Effect<GetByPathResult<R>> => {
  return pipe(
    getByPaths(root, [path]),
    map(NA.head),
  )
}

export const getByPathsDocwsroot = (paths: NEA<NormalizedPath>): Effect<NEA<GetByPathResult<T.DetailsDocwsRoot>>> => {
  return pipe(
    chainCachedDocwsRoot(root => getByPaths(root, paths)),
  )
}

export const getByPathDocwsroot = (path: NormalizedPath): Effect<GetByPathResult<T.DetailsDocwsRoot>> => {
  return pipe(
    getByPathsDocwsroot([path]),
    map(NA.head),
  )
}

export const getByPathFolderFromCache = <R extends T.Root>(path: NormalizedPath) =>
  (root: R): Effect<T.Details> =>
    chainCache(cache =>
      SRTE.fromEither(pipe(
        C.getByPath(root, path)(cache),
        _ =>
          _.valid
            ? E.of(pathTarget(_))
            : E.left(NotFoundError.create(`not found ${path}`)),
        E.filterOrElse(T.isDetails, () => ItemIsNotFolderError.create()),
      ))
    )

export const getByPathsFromCache = <R extends T.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
): Effect<NEA<GetByPathResult<R>>> =>
  asksCache(
    C.getByPaths(root, paths),
  )
