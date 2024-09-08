/* eslint-disable @typescript-eslint/no-unused-vars */
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { fst } from 'fp-ts/lib/Tuple'

import { loggerIO } from '../../../../logging'
import { err } from '../../../../util/errors'
import { guardFst } from '../../../../util/guards'
import { NormalizedPath } from '../../../../util/normalize-path'
import { NEA } from '../../../../util/types'
import { recordFromTuples } from '../../../../util/util'
import { DriveLookup, Types } from '../../..'
import { equalsDrivewsId, findInParentFilename } from '../../../util/drive-helpers'
import { modifySubset } from '../../../util/drive-modify-subset'
import * as GetByPath from '../../../util/get-by-path-types'
import { ApiUsage } from '../../drive-lookup'
import { ItemIsNotFileError, ItemIsNotFolderError, NotFoundError } from '../../errors'

export type GetByPathsParams = {
  apiUsage: ApiUsage
}

export const defaultParams: GetByPathsParams = {
  apiUsage: 'always',
}

export const onlyCache = (onlyCache: boolean): GetByPathsParams => ({
  apiUsage: onlyCache ? 'onlycache' : 'always',
})

/** Given a root and a list of paths, retrieves the actual items if they exist. */
export const getByPaths = <R extends Types.Root>(
  root: R,
  paths: NEA<NormalizedPath>,
  { apiUsage } = defaultParams,
): DriveLookup.Lookup<NEA<GetByPath.Result<R>>> =>
  pipe(
    loggerIO.debug(`getByPaths(${paths})`),
    SRTE.fromIO,
    // get what we have cached
    SRTE.chain(() => DriveLookup.getByPathsFromCache(root, paths)),
    SRTE.chain((cached) => {
      switch (apiUsage) {
        case 'onlycache':
          return SRTE.of(cached)
        case 'always':
          // validate the cached paths
          return getByPathsC(paths, cached)
        case 'fallback':
          return GetByPath.containsInvalidPath(cached)
            ? getByPathsC(paths, cached)
            : SRTE.of(cached)
      }
    }),
  )

const getByPathsC = <R extends Types.Root>(
  paths: NEA<NormalizedPath>,
  cached: NEA<GetByPath.Result<R>>,
): DriveLookup.Lookup<NEA<GetByPath.Result<R>>> =>
  pipe(
    DriveLookup.of(cached),
    SRTE.chainFirstIOK(() => loggerIO.debug(`getByPathsC(${paths})`)),
    SRTE.chainFirstIOK(
      (cached) => loggerIO.debug(`cached: ${cached.map(GetByPath.showGetByPathResult).join('\n')}`),
    ),
    SRTE.chain((cached) =>
      pipe(
        // validate
        validateCachedHierarchies(
          pipe(cached, NA.map(_ => _.details)),
        ),
        SRTE.map(NA.zip(cached)),
        SRTE.map(NA.map(([validated, cached]) => concatCachedWithValidated(cached, validated))),
      )
    ),
    SRTE.map(NA.zip(paths)),
    SRTE.chain(getActuals),
  )

/**
Given cached root and a cached hierarchy determine which part of the hierarchy is unchanged
 */
const validateCachedHierarchies = <R extends Types.Root>(
  cachedHierarchies: NEA<GetByPath.Hierarchy<R>>,
): DriveLookup.Lookup<NEA<GetByPath.Result<R>>> => {
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

  const cachedRoot = GetByPath.root(NA.head(cachedHierarchies))
  const cachedRests = pipe(cachedHierarchies, NA.map(GetByPath.tail))

  const drivewsids = pipe(
    A.flatten(cachedRests),
    A.uniq(equalsDrivewsId()),
    A.map(_ => _.drivewsid),
  )

  return pipe(
    loggerIO.debug(`validateHierarchies: [${cachedHierarchies.map(showHierarchiy)}]`),
    SRTE.fromIO,
    SRTE.chain(() =>
      // retrieve details from api or from temp cache
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
  cached: GetByPath.Result<R>,
  validated: GetByPath.PathValidation<R>,
): GetByPath.PathValidation<R> => {
  // if cached is valid
  if (cached.valid) {
    // and its validation is valid
    if (GetByPath.isValidPath(validated)) {
      // if original path was targeting a file
      // try to find it in the actual details
      const file = GetByPath.getFile(cached)

      if (O.isSome(file)) {
        const fname = Types.fileName(file.value)
        const parent = NA.last(validated.details)

        return pipe(
          findInParentFilename(parent, Types.fileName(file.value)),
          O.fold(
            () => E.left(NotFoundError.createTemplate(fname, parent.drivewsid)),
            (actualFileItem) =>
              // if a folder with the same name as the file was found
              Types.isFileItem(actualFileItem)
                ? E.of(actualFileItem)
                : E.left(ItemIsNotFileError.createTemplate(actualFileItem)),
          ),
          E.foldW(
            (e) => GetByPath.invalidPath(validated.details, [fname], e),
            file => GetByPath.validPath(validated.details, O.some(file)),
          ),
        )
      }
      else {
        // if not a file was targeted then the cached path is still valid
        loggerIO.debug(`V.validResult: ${showDetails(NA.last(validated.details))}`)()
        return GetByPath.validPath(validated.details)
      }
    }
    else {
      // return what is actually valid currently
      return validated
    }
  }
  else {
    // cached path is invalid
    if (GetByPath.isValidPath(validated)) {
      return GetByPath.invalidPath(validated.details, cached.rest, cached.error)
    }
    else {
      return GetByPath.invalidPath(
        validated.details,
        NA.concat(cached.rest)(validated.rest),
        err(`the path changed`),
      )
    }
  }
}

const getActuals = <R extends Types.Root>(
  validationResults: NEA<[GetByPath.PathValidation<R>, NormalizedPath]>,
): DriveLookup.Lookup<NEA<GetByPath.PathValidation<R>>> => {
  loggerIO.debug(
    `getActuals: ${
      validationResults.map(([p, path]) => `for ${path}. so far we have: ${GetByPath.showGetByPathResult(p)}`)
    }`,
  )()
  return pipe(
    modifySubset(
      validationResults,
      guardFst(GetByPath.isInvalidPath),
      (subset) => pipe(subset, NA.map(fst), handleInvalidPaths),
      ([h, p]): GetByPath.Result<R> => h,
    ),
  )
}

type DeeperFolders<R extends Types.Root> =
  // folders items with empty rest (valid, requires details)
  | [O.Some<Types.DriveChildrenItemFolder | Types.DriveChildrenItemAppLibrary>, [[], GetByPath.PathInvalid<R>]]
  // folders items with non empty rest (incomplete paths)
  | [
    O.Some<Types.DriveChildrenItemFolder | Types.DriveChildrenItemAppLibrary>,
    [NEA<string>, GetByPath.PathInvalid<R>],
  ]

const handleInvalidPaths = <R extends Types.Root>(
  partialPaths: NEA<GetByPath.PathInvalid<R>>,
): DriveLookup.Lookup<NEA<GetByPath.PathValidation<R>>> => {
  loggerIO.debug(`retrivePartials: ${partialPaths.map(GetByPath.showGetByPathResult)}`)()

  const handleSubfolders = <R extends Types.Root>(
    subfolders: NEA<DeeperFolders<R>>,
  ): DriveLookup.Lookup<NEA<GetByPath.Result<R>>> => {
    loggerIO.debug(`handleSubfolders: ${
      subfolders.map(([item, [rest, partial]]) => {
        return `item: ${Types.fileName(item.value)}. rest: [${rest}]`
      })
    }`)()

    const foldersToRetrieve = pipe(
      subfolders,
      NA.map(([item, [rest, validPart]]) => item.value.drivewsid),
    )

    return pipe(
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
              [NEA<string>, GetByPath.PathInvalid<R>],
            ],
          ] => pipe(v, ([details, [item, [rest, partial]]]) => A.isNonEmpty(rest)),
          (task) => {
            return pipe(
              task,
              NA.map(([details, [item, [rest, partial]]]): GetByPath.PathInvalid<R> =>
                GetByPath.invalidPath(
                  GetByPath.concat(partial.details, [details]),
                  rest,
                  err(`we need to go deepr)`),
                )
              ),
              handleInvalidPaths,
            )
          },
          ([details, [item, [rest, partial]]]): GetByPath.PathValid<R> => {
            return GetByPath.validFolder(GetByPath.concat(partial.details, [details]))
          },
        )
      }),
    )
  }

  const handleFiles = <R extends Types.Root>() =>
    (
      [item, [rest, partial]]: [
        O.Some<Types.DriveChildrenItemFile>,
        [string[], GetByPath.PathInvalid<R>],
      ],
    ): GetByPath.PathValidation<R> => {
      return pipe(
        rest,
        A.match(
          (): GetByPath.PathValid<R> => GetByPath.validPath(partial.details, item),
          (rest): GetByPath.PathValidation<R> => ({
            valid: false,
            error: ItemIsNotFolderError.create(`item is not folder`),
            details: partial.details,
            rest: NA.concat([Types.fileName(item.value)], rest),
          }),
        ),
      )
    }

  const handleFoundItems = <R extends Types.Root>(
    found: NEA<[O.Some<Types.DriveChildrenItem>, [string[], GetByPath.PathInvalid<R>]]>,
  ): DriveLookup.Lookup<GetByPath.Result<R>[]> => {
    loggerIO.debug(`handleFoundItems. ${
      found.map(([item, [rest, partial]]) => {
        return `item: ${Types.fileName(item.value)}.`
      })
    }`)()

    const selectFolders = (
      v: [O.Some<Types.DriveChildrenItem>, [string[], GetByPath.PathInvalid<R>]],
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
    (v): v is [O.Some<Types.DriveChildrenItem>, [string[], GetByPath.PathInvalid<R>]] => pipe(v, fst, O.isSome),
    handleFoundItems,
    ([item, [rest, partial]]): GetByPath.Result<R> => {
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
  cachedHierarchy: GetByPath.Hierarchy<R>,
  actualDetails: [R, ...O.Option<Types.NonRootDetails>[]],
): GetByPath.PathValidation<R> => {
  const [actualRoot, ...actualPath] = actualDetails
  const [cachedroot, ...cachedPath] = cachedHierarchy

  const actualPathDetails = pipe(
    actualPath,
    A.takeLeftWhile(O.isSome),
    A.map(_ => _.value),
  )

  return pipe(
    A.zip(actualPathDetails, cachedPath),
    A.takeLeftWhile(([a, b]) => GetByPath.isSameDetails(a, b)),
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
          () => GetByPath.validPath([actualRoot, ...validPart]),
          rest => GetByPath.invalidPath([actualRoot, ...validPart], rest, err(`details changed`)),
        ),
      ),
  )
}

const showHierarchiy = (h: GetByPath.Hierarchy<Types.Root>): string => {
  const [root, ...rest] = h

  return `${Types.isCloudDocsRootDetails(root) ? 'root' : 'trash'}/${rest.map(Types.fileName).join('/')}`
}

const showDetails = (details: Types.Details) => {
  return `${Types.isTrashDetailsG(details) ? 'TRASH_ROOT' : details.type} ${Types.fileName(details)}. items: [${
    details.items.map(Types.fileName)
  }]`
}
