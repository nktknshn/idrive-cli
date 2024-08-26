import * as E from 'fp-ts/Either'
import { pipe } from 'fp-ts/lib/function'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { NormalizedPath } from '../../../util/normalize-path'
import { NEA } from '../../../util/types'
import * as T from '../../drive-types'
import { GetByPathResult, pathTarget } from '../../util/get-by-path-types'
import { Lookup } from '..'
import * as C from '../cache/cache'
import { ItemIsNotFolderError, NotFoundError } from '../errors'
import { asksCache, chainCache } from './cache-methods'

export const getByPathFolderFromCache = <R extends T.Root>(path: NormalizedPath) =>
  (root: R): Lookup<T.Details> =>
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
): Lookup<NEA<GetByPathResult<R>>> =>
  asksCache(
    C.getByPaths(root, paths),
  )

export const getByPathsFromCacheTemp = <R extends T.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
): Lookup<NEA<GetByPathResult<R>>> =>
  asksCache(
    C.getByPaths(root, paths),
  )
