import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import { NormalizedPath } from '../../../cli/cli-drive/cli-drive-actions/helpers'
import { err } from '../../../lib/errors'
import { logg, logger } from '../../../lib/logging'
import { NEA } from '../../../lib/types'
import * as C from '../cache/cache'
import * as V from '../cache/cache-get-by-path-types'
import * as DF from '../drive'
import { ItemIsNotFileError, ItemIsNotFolderError, NotFoundError } from '../errors'
import { equalsDrivewsId, findInParent as lookupItemByFilename, recordFromTuples } from '../helpers'
import * as T from '../requests/types/types'
import { modifySubset } from './modify-subset'
import * as H from './validation'

export const getByPathsH = <R extends T.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
): DF.DriveM<NEA<V.GetByPathResult<R>>> =>
  pipe(
    validateCachedPaths(root, paths),
    SRTE.map(NA.zip(paths)),
    SRTE.chain(getActuals),
  )

export const getByPaths = <R extends T.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
): DF.DriveM<NEA<DF.DetailsOrFile<R>>> => {
  return pipe(
    getByPathsH(root, paths),
    SRTE.chain(
      flow(
        NA.map(res =>
          res.valid
            ? E.of(V.target(res))
            : E.left(
              err(
                `error: ${res.error}. validPart=${res.path.details.map(T.fileName)} rest=[${res.path.rest}]`,
              ),
            )
        ),
        E.sequenceArray,
        E.map(RA.toArray),
        SRTE.fromEither,
        SRTE.chain(a =>
          pipe(
            NA.fromArray(a),
            DF.fromOption(() => err(`mystically returned empty array`)),
          )
        ),
      ),
    ),
  )
}

const validateCachedPaths = <R extends T.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
): DF.DriveM<NEA<V.GetByPathResult<R>>> => {
  logg(`validateCachedPaths: ${paths}`)
  return pipe(
    DF.getByPathsCached(root, paths),
    DF.logS((cached) => `cached: ${cached.map(V.showGetByPathResult).join('      &&      ')}`),
    SRTE.chain((cached) =>
      pipe(
        validateCachedHierarchies(pipe(cached, NA.map(_ => _.path.details))),
        SRTE.map(NA.zip(cached)),
        SRTE.map(NA.map(([validated, cached]) => concatCachedWithValidated(cached, validated))),
      )
    ),
    DF.logS(paths => `result: [${paths.map(V.showGetByPathResult).join(', ')}]`),
  )
}

/**
Given cached root and a cached hierarchy determine which part of the hierarchy is unchanged
 */
const validateCachedHierarchies = <R extends T.Root>(
  cachedHierarchies: NEA<H.Hierarchy<R>>,
): DF.DriveM<NEA<H.WithDetails<H.Hierarchy<R>>>> => {
  const toActual = (
    cachedPath: T.NonRootDetails[],
    actualsRecord: Record<string, O.Option<T.NonRootDetails>>,
  ): O.Option<T.NonRootDetails>[] => {
    return pipe(
      cachedPath,
      A.map(h => R.lookup(h.drivewsid)(actualsRecord)),
      A.map(O.flatten),
    )
  }

  const cachedRoot = H.root(NA.head(cachedHierarchies))
  const cachedRests = pipe(cachedHierarchies, NA.map(H.tail))

  const drivewsids = pipe(
    A.flatten(cachedRests),
    A.uniq(equalsDrivewsId()),
    A.map(_ => _.drivewsid),
  )

  return pipe(
    logg(`validateHierarchies: [${cachedHierarchies.map(showHierarchiy)}]`),
    () =>
      DF.retrieveItemDetailsInFoldersSaving<R>([
        cachedRoot.drivewsid,
        ...drivewsids,
      ]),
    SRTE.map(([actualRoot, ...actualRest]) => {
      const detailsRecord = recordFromTuples(
        A.zip(drivewsids, actualRest),
      )

      return pipe(
        cachedRests,
        NA.map(cachedPath =>
          H.getValidHierarchyPart<R>(
            [cachedRoot, ...cachedPath],
            [actualRoot.value, ...toActual(cachedPath, detailsRecord)],
          )
        ),
      )
    }),
  )
}

const concatCachedWithValidated = <R extends T.Root>(
  cached: V.GetByPathResult<R>,
  validated: H.PathValidation<H.Hierarchy<R>>,
): V.PathValidation<H.Hierarchy<R>> => {
  // if cached is valid
  if (cached.valid) {
    // and its validation
    if (H.isValid(validated)) {
      // if original path was targeting a file
      // try to find it in the actual details
      if (O.isSome(cached.file)) {
        const fname = T.fileName(cached.file.value)
        const parent = NA.last(validated.details)

        return pipe(
          lookupItemByFilename(parent, T.fileName(cached.file.value)),
          O.fold(
            () => E.left(NotFoundError.createTemplate(fname, parent.drivewsid)),
            (actualFileItem) =>
              T.isFileItem(actualFileItem)
                ? E.of(actualFileItem)
                : E.left(ItemIsNotFileError.createTemplate(actualFileItem)),
          ),
          E.fold(
            (e) =>
              V.invalidPath(
                H.partialPath(validated.details, [fname]),
                e,
              ),
            file => V.validPath(validated.details, O.some(file)),
          ),
        )
      }
      else {
        // if not file was targeted then the cached path is still valid
        logger.debug(`V.validResult: ${showDetails(NA.last(validated.details))}`)
        return V.validPath(validated.details)
      }
    }
    else {
      //
      return V.invalidPath(validated, err(`the path changed`))
    }
  }
  else {
    if (H.isValid(validated)) {
      return V.invalidPath(
        H.partialPath(
          validated.details,
          cached.path.rest,
        ),
        cached.error,
      )
    }
    else {
      return V.invalidPath(
        H.partialPath(
          validated.details,
          NA.concat(validated.rest, cached.path.rest),
        ),
        err(`the path changed`),
      )
    }
  }
}

const getActuals = <R extends T.Root>(
  validationResults: NEA<[V.PathValidation<H.Hierarchy<R>>, NormalizedPath]>,
): DF.DriveM<NEA<V.PathValidation<H.Hierarchy<R>>>> => {
  logger.debug(
    `getActuals: ${validationResults.map(([p, path]) => `for ${path}. so far we have: ${V.showGetByPathResult(p)}`)}`,
  )
  return pipe(
    modifySubset(
      validationResults,
      (res): res is [V.PathInvalid<H.Hierarchy<R>>, NormalizedPath] => !res[0].valid,
      (subset: NEA<[V.PathInvalid<H.Hierarchy<R>>, NormalizedPath]>) => pipe(subset, NA.map(fst), handleInvalidPaths),
      ([h, p]): V.GetByPathResult<R> => h,
      // : [V.PathValid<H.Hierarchy<R>>, NormalizedPath]
    ),
  )
}

type DeeperFolders<R extends T.Root> =
  // folders items with empty rest (valid, requires details)
  | [O.Some<T.DriveChildrenItemFolder | T.DriveChildrenItemAppLibrary>, [[], V.PathInvalid<H.Hierarchy<R>>]]
  // folders items with non empty rest (incomplete paths)
  | [
    O.Some<T.DriveChildrenItemFolder | T.DriveChildrenItemAppLibrary>,
    [NEA<string>, V.PathInvalid<H.Hierarchy<R>>],
  ]

const handleInvalidPaths = <R extends T.Root>(
  partialPaths: NEA<V.PathInvalid<H.Hierarchy<R>>>,
): DF.DriveM<NEA<V.PathValidation<H.Hierarchy<R>>>> => {
  logger.debug(`retrivePartials: ${partialPaths.map(V.showGetByPathResult)}`)

  const handleSubfolders = <R extends T.Root>(
    subfolders: NEA<DeeperFolders<R>>,
  ): DF.DriveM<NEA<V.GetByPathResult<R>>> => {
    logger.debug(`handleFolders: ${
      subfolders.map(([item, [rest, partial]]) => {
        return `item: ${T.fileName(item.value)}. rest: [${rest}]`
      })
    }`)

    const foldersToRetrieve = pipe(
      subfolders,
      NA.map(([item, [rest, validPart]]) => item.value.drivewsid),
    )

    return pipe(
      DF.retrieveItemDetailsInFoldersSavingE(foldersToRetrieve),
      SRTE.map(NA.zip(subfolders)),
      SRTE.chain((details) => {
        return modifySubset(
          details,
          // select
          (v): v is [
            T.NonRootDetails,
            [
              O.Some<T.DriveChildrenItemFolder | T.DriveChildrenItemAppLibrary>,
              [NEA<string>, V.PathInvalid<H.Hierarchy<R>>],
            ],
          ] => pipe(v, ([details, [item, [rest, partial]]]) => A.isNonEmpty(rest)),
          (task) => {
            return pipe(
              task,
              NA.map(([details, [item, [rest, partial]]]): V.PathInvalid<H.Hierarchy<R>> =>
                V.invalidPath(
                  H.partialPath(
                    H.concat(partial.path.details, [details]),
                    rest,
                  ),
                  err(`we need to go deepr)`),
                )
              ),
              handleInvalidPaths,
            )
          },
          ([details, [item, [rest, partial]]]): V.PathValid<H.Hierarchy<R>> => {
            return {
              valid: true,
              path: H.validPath(H.concat(partial.path.details, [details])),
              file: O.none,
            }
          },
        )
      }),
    )
  }

  const handleFiles = <R extends T.Root>() =>
    (
      [item, [rest, partial]]: [
        O.Some<T.DriveChildrenItemFile>,
        [string[], V.PathInvalid<H.Hierarchy<R>>],
      ],
    ): V.PathValidation<H.Hierarchy<R>> => {
      return pipe(
        rest,
        A.match(
          (): V.PathValid<H.Hierarchy<R>> => ({
            valid: true,
            file: item,
            path: H.validPath(partial.path.details),
          }),
          (rest): V.PathValidation<H.Hierarchy<R>> => ({
            valid: false,
            error: ItemIsNotFolderError.create(`item is not folder`),
            path: H.partialPath(partial.path.details, NA.concat([T.fileName(item.value)], rest)),
          }),
        ),
      )
    }

  const handleFoundItems = <R extends T.Root>(
    found: NEA<[O.Some<T.DriveChildrenItem>, [string[], V.PathInvalid<H.Hierarchy<R>>]]>,
  ): DF.DriveM<V.GetByPathResult<R>[]> => {
    logger.debug(`handleItems. ${
      found.map(([item, [rest, partial]]) => {
        return `item: ${T.fileName(item.value)}.`
      })
    }`)

    const selectFolders = (
      v: [O.Some<T.DriveChildrenItem>, [string[], V.PathInvalid<H.Hierarchy<R>>]],
    ): v is DeeperFolders<R> => T.isFolderLikeItem(v[0].value)

    if (A.isNonEmpty(found)) {
      return modifySubset(found, selectFolders, handleSubfolders, handleFiles())
    }

    return SRTE.of([])
  }

  const nextItems = pipe(
    partialPaths,
    NA.map(_ => lookupItemByFilename(NA.last(_.path.details), NA.head(_.path.rest))),
    NA.zip(pipe(partialPaths, NA.map(_ => NA.tail(_.path.rest)), NA.zip(partialPaths))),
  )

  return modifySubset(
    nextItems,
    // select items that were found
    (v): v is [O.Some<T.DriveChildrenItem>, [string[], V.PathInvalid<H.Hierarchy<R>>]] => pipe(v, fst, O.isSome),
    handleFoundItems,
    ([item, [rest, partial]]): V.GetByPathResult<R> => {
      // : [O.None, [string[], V.PathInvalid<H.Hierarchy<R>>]]
      return {
        valid: false,
        error: NotFoundError.createTemplate(
          NA.head(partial.path.rest),
          T.fileName(NA.last(partial.path.details)),
        ),
        path: partial.path,
      }
    },
  )
}

const showHierarchiy = (h: H.Hierarchy<T.Root>): string => {
  const [root, ...rest] = h

  return `${T.isCloudDocsRootDetails(root) ? 'root' : 'trash'}/${rest.map(T.fileName).join('/')}`
}

const showDetails = (details: T.Details) => {
  return `${T.isTrashDetailsG(details) ? 'TRASH_ROOT' : details.type} ${T.fileName(details)}. items: [${
    details.items.map(T.fileName)
  }]`
}
