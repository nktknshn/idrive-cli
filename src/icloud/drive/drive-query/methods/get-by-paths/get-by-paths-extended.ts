import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { err } from '../../../../../util/errors'
import { NormalizedPath } from '../../../../../util/normalize-path'
import { NEA } from '../../../../../util/types'
import { sequenceArrayNEA } from '../../../../../util/util'
import * as V from '../../../get-by-path-types'
import * as T from '../../../icloud-drive-types'
import { Effect, filterOrElse, map } from '../..'
import { ItemIsNotFolderError } from '../../errors'
import { chainCachedDocwsRoot } from '../get-roots'
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

export const getByPath = <R extends T.Root>(root: R, path: NormalizedPath): Effect<V.GetByPathResult<R>> => {
  return pipe(
    getByPaths(root, [path]),
    map(NA.head),
  )
}

export const getByPathsDocwsroot = (paths: NEA<NormalizedPath>): Effect<NEA<V.GetByPathResult<T.DetailsDocwsRoot>>> => {
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
