/* eslint-disable @typescript-eslint/no-unused-vars */

import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { flow, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { fst } from 'fp-ts/lib/Tuple'
import { loggerIO } from '../../../../logging/loggerIO'
import { err } from '../../../../util/errors'
import { guardFst } from '../../../../util/guards'
import { NormalizedPath } from '../../../../util/normalize-path'
import { NEA } from '../../../../util/types'
import { recordFromTuples } from '../../../../util/util'
import { DriveLookup, Types } from '../../..'
import { equalsDrivewsId, findInParentFilename } from '../../../util/drive-helpers'
import { modifySubset } from '../../../util/drive-modify-subset'
import * as V from '../../../util/get-by-path-types'
import { ItemIsNotFileError, ItemIsNotFolderError, NotFoundError } from '../../errors'

export const getByPaths = <R extends Types.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
): DriveLookup.Lookup<NEA<V.GetByPathResult<R>>> =>
  pipe(
    loggerIO.debug(`getByPaths(${paths})`),
    SRTE.fromIO,
    SRTE.chain(() => DriveLookup.getByPathsFromCache(root, paths)),
    SRTE.chain(cached => getByPathsC(paths, cached)),
  )

const getByPathsC = <R extends Types.Root>(
  paths: NEA<NormalizedPath>,
  cached: NEA<V.GetByPathResult<R>>,
): DriveLookup.Lookup<NEA<V.GetByPathResult<R>>> =>
  pipe(
    DriveLookup.of(cached),
    SRTE.chainFirstIOK(() => loggerIO.debug(`getByPathsC(${paths})`)),
    SRTE.chainFirstIOK(
      (cached) => loggerIO.debug(`cached: ${cached.map(V.showGetByPathResult).join('\n')}`),
    ),
    SRTE.chain((cached) =>
      pipe(
        validateCachedHierarchies(
          pipe(cached, NA.map(_ => _.details)),
        ),
        SRTE.map(NA.zip(cached)),
        SRTE.map(NA.map(([validated, cached]) => concatCachedWithValidated(cached, validated))),
      )
    ),
    // SRTE.chainFirstIOK(
    //   paths => loggerIO.debug(`result: [${paths.map(V.showGetByPathResult).join(', ')}]`),
    // ),
    SRTE.map(NA.zip(paths)),
    SRTE.chain(getActuals),
  )

/**
Given cached root and a cached hierarchy determine which part of the hierarchy is unchanged
 */
const validateCachedHierarchies = <R extends Types.Root>(
  cachedHierarchies: NEA<V.Hierarchy<R>>,
): DriveLookup.Lookup<NEA<V.PathValidation<R>>> => {
  const toActual = (
    cachedPath: Types.NonRootDetails[],
    actualsRecord: Record<string, O.Option<Types.NonRootDetails>>,
  ): O.Option<Types.NonRootDetails>[] => {
    return pipe(
      cachedPath,
      A.map(h => R.lookup(h.drivewsid)(actualsRecord)),
      A.map(O.flatten),
    )
  }

  const cachedRoot = V.root(NA.head(cachedHierarchies))
  const cachedRests = pipe(cachedHierarchies, NA.map(V.tail))

  const drivewsids = pipe(
    A.flatten(cachedRests),
    A.uniq(equalsDrivewsId()),
    A.map(_ => _.drivewsid),
  )

  return pipe(
    loggerIO.debug(`validateHierarchies: [${cachedHierarchies.map(showHierarchiy)}]`),
    SRTE.fromIO,
    SRTE.chain(() =>
      // DriveLookup.retrieveItemDetailsInFoldersSaving<R>([
      //   cachedRoot.drivewsid,
      //   ...drivewsids,
      // ])
      DriveLookup.retrieveItemDetailsInFoldersTempCached<R>([
        cachedRoot.drivewsid,
        ...drivewsids,
      ])
    ),
    SRTE.map(([actualRoot, ...actualRest]) => {
      const detailsRecord = recordFromTuples(
        A.zip(drivewsids, actualRest),
      )

      return pipe(
        cachedRests,
        NA.map(cachedPath =>
          getValidHierarchyPart<R>(
            [cachedRoot, ...cachedPath],
            [actualRoot.value, ...toActual(cachedPath, detailsRecord)],
          )
        ),
      )
    }),
  )
}

const concatCachedWithValidated = <R extends Types.Root>(
  cached: V.GetByPathResult<R>,
  validated: V.PathValidation<R>,
): V.PathValidation<R> => {
  // if cached is valid
  if (cached.valid) {
    // and its validation
    if (V.isValidPath(validated)) {
      // if original path was targeting a file
      // try to find it in the actual details
      if (O.isSome(cached.file)) {
        const fname = Types.fileName(cached.file.value)
        const parent = NA.last(validated.details)

        return pipe(
          findInParentFilename(parent, Types.fileName(cached.file.value)),
          O.fold(
            () => E.left(NotFoundError.createTemplate(fname, parent.drivewsid)),
            (actualFileItem) =>
              Types.isFileItem(actualFileItem)
                ? E.of(actualFileItem)
                : E.left(ItemIsNotFileError.createTemplate(actualFileItem)),
          ),
          E.foldW(
            (e) =>
              V.invalidPath(
                validated.details,
                [fname],
                e,
              ),
            file => V.validPath(validated.details, O.some(file)),
          ),
        )
      }
      else {
        // if not file was targeted then the cached path is still valid
        loggerIO.debug(`V.validResult: ${showDetails(NA.last(validated.details))}`)()
        return V.validPath(validated.details)
      }
    }
    else {
      //
      return validated
    }
  }
  else {
    if (V.isValidPath(validated)) {
      return V.invalidPath(
        validated.details,
        cached.rest,
        cached.error,
      )
    }
    else {
      return V.invalidPath(
        validated.details,
        NA.concat(validated.rest, cached.rest),
        err(`the path changed`),
      )
    }
  }
}

const getActuals = <R extends Types.Root>(
  validationResults: NEA<[V.PathValidation<R>, NormalizedPath]>,
): DriveLookup.Lookup<NEA<V.PathValidation<R>>> => {
  loggerIO.debug(
    `getActuals: ${validationResults.map(([p, path]) => `for ${path}. so far we have: ${V.showGetByPathResult(p)}`)}`,
  )()
  return pipe(
    modifySubset(
      validationResults,
      guardFst(V.isInvalidPath),
      // (res): res is [V.PathInvalid<R>, NormalizedPath] => !res[0].valid,
      (subset) => pipe(subset, NA.map(fst), handleInvalidPaths),
      ([h, p]): V.GetByPathResult<R> => h,
      // : [V.PathValid<H.Hierarchy<R>>, NormalizedPath]
    ),
  )
}
// : NEA<[V.PathInvalid<R>, NormalizedPath]>

type DeeperFolders<R extends Types.Root> =
  // folders items with empty rest (valid, requires details)
  | [O.Some<Types.DriveChildrenItemFolder | Types.DriveChildrenItemAppLibrary>, [[], V.PathInvalid<R>]]
  // folders items with non empty rest (incomplete paths)
  | [
    O.Some<Types.DriveChildrenItemFolder | Types.DriveChildrenItemAppLibrary>,
    [NEA<string>, V.PathInvalid<R>],
  ]

const handleInvalidPaths = <R extends Types.Root>(
  partialPaths: NEA<V.PathInvalid<R>>,
): DriveLookup.Lookup<NEA<V.PathValidation<R>>> => {
  loggerIO.debug(`retrivePartials: ${partialPaths.map(V.showGetByPathResult)}`)()

  const handleSubfolders = <R extends Types.Root>(
    subfolders: NEA<DeeperFolders<R>>,
  ): DriveLookup.Lookup<NEA<V.GetByPathResult<R>>> => {
    loggerIO.debug(`handleSubfolders: ${
      subfolders.map(([item, [rest, partial]]) => {
        return `item: ${Types.fileName(item.value)}. rest: [${rest}]`
      })
    }`)()

    const foldersToRetrieve = pipe(
      subfolders,
      NA.map(([item, [rest, validPart]]) => item.value.drivewsid),
      // NA.uniq(Eq),
    )

    return pipe(
      // DriveLookup.retrieveItemDetailsInFoldersSavingStrict(foldersToRetrieve),
      DriveLookup.retrieveItemDetailsInFoldersTempCachedStrict(foldersToRetrieve),
      SRTE.map(NA.zip(subfolders)),
      SRTE.chain((details) => {
        return modifySubset(
          details,
          // select
          (v): v is [
            Types.NonRootDetails,
            [
              O.Some<Types.DriveChildrenItemFolder | Types.DriveChildrenItemAppLibrary>,
              [NEA<string>, V.PathInvalid<R>],
            ],
          ] => pipe(v, ([details, [item, [rest, partial]]]) => A.isNonEmpty(rest)),
          (task) => {
            return pipe(
              task,
              NA.map(([details, [item, [rest, partial]]]): V.PathInvalid<R> =>
                V.invalidPath(
                  V.concat(partial.details, [details]),
                  rest,
                  err(`we need to go deepr)`),
                )
              ),
              handleInvalidPaths,
            )
          },
          ([details, [item, [rest, partial]]]): V.PathValid<R> => {
            return {
              valid: true,
              details: V.concat(partial.details, [details]),
              file: O.none,
            }
          },
        )
      }),
    )
  }

  const handleFiles = <R extends Types.Root>() =>
    (
      [item, [rest, partial]]: [
        O.Some<Types.DriveChildrenItemFile>,
        [string[], V.PathInvalid<R>],
      ],
    ): V.PathValidation<R> => {
      return pipe(
        rest,
        A.match(
          (): V.PathValid<R> => ({
            valid: true,
            file: item,
            details: partial.details,
          }),
          (rest): V.PathValidation<R> => ({
            valid: false,
            error: ItemIsNotFolderError.create(`item is not folder`),
            details: partial.details,
            rest: NA.concat([Types.fileName(item.value)], rest),
          }),
        ),
      )
    }

  const handleFoundItems = <R extends Types.Root>(
    found: NEA<[O.Some<Types.DriveChildrenItem>, [string[], V.PathInvalid<R>]]>,
  ): DriveLookup.Lookup<V.GetByPathResult<R>[]> => {
    loggerIO.debug(`handleFoundItems. ${
      found.map(([item, [rest, partial]]) => {
        return `item: ${Types.fileName(item.value)}.`
      })
    }`)()

    const selectFolders = (
      v: [O.Some<Types.DriveChildrenItem>, [string[], V.PathInvalid<R>]],
    ): v is DeeperFolders<R> => Types.isFolderLikeItem(v[0].value)

    if (A.isNonEmpty(found)) {
      return modifySubset(
        found,
        selectFolders,
        handleSubfolders,
        handleFiles(),
      )
    }

    return SRTE.of([])
  }

  const nextItems = pipe(
    partialPaths,
    NA.map(_ => findInParentFilename(NA.last(_.details), NA.head(_.rest))),
    NA.zip(pipe(partialPaths, NA.map(_ => NA.tail(_.rest)), NA.zip(partialPaths))),
  )

  return modifySubset(
    nextItems,
    // select items that were found
    (v): v is [O.Some<Types.DriveChildrenItem>, [string[], V.PathInvalid<R>]] => pipe(v, fst, O.isSome),
    handleFoundItems,
    ([item, [rest, partial]]): V.GetByPathResult<R> => {
      // : [O.None, [string[], V.PathInvalid<H.Hierarchy<R>>]]
      return {
        valid: false,
        error: NotFoundError.createTemplate(
          NA.head(partial.rest),
          Types.fileName(NA.last(partial.details)),
        ),
        details: partial.details,
        rest: partial.rest,
      }
    },
  )
}

const getValidHierarchyPart = <R extends Types.Root>(
  cachedHierarchy: V.Hierarchy<R>,
  actualDetails: [R, ...O.Option<Types.NonRootDetails>[]],
): V.PathValidation<R> => {
  const [actualRoot, ...actualPath] = actualDetails
  const [cachedroot, ...cachedPath] = cachedHierarchy

  const actualPathDetails = pipe(
    actualPath,
    A.takeLeftWhile(O.isSome),
    A.map(_ => _.value),
  )

  return pipe(
    A.zip(actualPathDetails, cachedPath),
    A.takeLeftWhile(([a, b]) => V.isSameDetails(a, b)),
    _ => ({
      validPart: A.takeLeft(_.length)(actualPathDetails),
      rest: pipe(
        cachedPath,
        A.dropLeft(_.length),
        A.map(Types.fileName),
      ),
    }),
    ({ validPart, rest }) =>
      pipe(
        rest,
        A.matchW(
          () => V.validPath([actualRoot, ...validPart]),
          rest => V.invalidPath([actualRoot, ...validPart], rest, err(`details changed`)),
        ),
      ),
  )
}

const showHierarchiy = (h: V.Hierarchy<Types.Root>): string => {
  const [root, ...rest] = h

  return `${Types.isCloudDocsRootDetails(root) ? 'root' : 'trash'}/${rest.map(Types.fileName).join('/')}`
}

const showDetails = (details: Types.Details) => {
  return `${Types.isTrashDetailsG(details) ? 'TRASH_ROOT' : details.type} ${Types.fileName(details)}. items: [${
    details.items.map(Types.fileName)
  }]`
}
