import { identity } from 'fp-ts'
import * as A from 'fp-ts/lib/Array'
import { bind } from 'fp-ts/lib/Chain'
import * as E from 'fp-ts/lib/Either'
import { fromEquals } from 'fp-ts/lib/Eq'
import { constant, constVoid, flow, hole, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as T from 'fp-ts/lib/These'
import { fst, snd } from 'fp-ts/lib/Tuple'
import { hierarchyToPath, itemWithHierarchyToPath, NormalizedPath } from '../../../cli/cli-drive-actions/helpers'
import { showDetailsInfo } from '../../../cli/cli-drive-actions/ls_action'
import { err } from '../../../lib/errors'
import { modifySubset, modifySubsetDF } from '../../../lib/helpers/projectIndexes'
import { logf, logg, logger, logReturn, logReturnAs, logReturnS } from '../../../lib/logging'
import { NEA } from '../../../lib/types'
import { cast, Path } from '../../../lib/util'
import * as CC from '../cache/Cache'
import * as C from '../cache/cachef'
import * as V from '../cache/GetByPathResultValid'
import { CacheEntity, CacheEntityFolderLike } from '../cache/types'
import { findInParent, partialPath, PartialyCached } from '../cache/validatePath'
import { ItemIsNotFileError, ItemIsNotFolderError, NotFoundError } from '../errors'
import * as DF from '../fdrive'
import { recordFromTuples } from '../helpers'
import {
  Details,
  DetailsRoot,
  DriveChildrenItem,
  DriveChildrenItemAppLibrary,
  DriveChildrenItemFile,
  DriveChildrenItemFolder,
  DriveDetailsWithHierarchy,
  DriveFolderLike,
  fileName,
  // Hierarchy,
  HierarchyItem,
  isDetails,
  isFileItem,
  isFolderDrivewsid,
  isFolderHierarchyEntry,
  isFolderLikeItem,
  isRootDetails,
  Root,
} from '../types'
import { HierarchyEntry } from '../types'
import { driveDetails, rootDrivewsid } from '../types-io'
import { lookupCache } from './lookupCache'
import { log } from './ls'
// import { getValidHierarchyPart, ValidatedHierarchy } from './validation'
import * as H from './validation'

type DetailsOrFile = (Details | DriveChildrenItemFile)

const equalsDrivewsId = fromEquals((a: { drivewsid: string }, b: { drivewsid: string }) => a.drivewsid == b.drivewsid)

const toActual = (
  cachedPath: Details[],
  actualsRecord: Record<string, O.Option<Details>>,
): O.Option<Details>[] => {
  return pipe(
    cachedPath,
    // A.dropLeft(1),
    A.map(h => R.lookup(h.drivewsid)(actualsRecord)),
    A.map(O.flatten),
  )
}

const showHierarchiy = (h: H.Hierarchy) => {
  const [root, ...rest] = h

  return `${isRootDetails(root) ? 'root' : '<!not root!>'}/${rest.map(fileName).join('/')}`
}

export const validateHierarchies = (
  cachedHierarchies: NEA<H.Hierarchy>,
): DF.DriveM<NEA<H.WithDetails>> => {
  const cachedRoot = cachedHierarchies[0][0]
  const cachedPaths = pipe(
    cachedHierarchies,
    NA.map(A.dropLeft(1)),
  )

  const drivewsids = pipe(
    cachedPaths,
    A.flatten,
    A.uniq(equalsDrivewsId),
    A.map(_ => _.drivewsid),
  )

  const res = pipe(
    logg(`validateHierarchies: [${cachedHierarchies.map(showHierarchiy)}]`),
    () =>
      pipe(
        DF.Do,
        SRTE.bind('validation', () => DF.retrieveItemDetailsInFoldersSavingNEA([rootDrivewsid, ...drivewsids])),
      ),
    SRTE.map(({ validation }) => {
      const detailsRecord = recordFromTuples(
        NA.zip([rootDrivewsid, ...drivewsids], validation),
      )
      return pipe(
        cachedPaths,
        NA.map(cachedPath =>
          H.getValidHierarchyPart(
            [validation[0].value, ...toActual(cachedPath, detailsRecord)],
            [cachedRoot, ...cachedPath],
          )
        ),
      )
    }),
    // SRTE.map(recordFromTuples),
    // SRTE.map(resultRecord =>
    //   pipe(
    //     cachedHierarchies,
    //     NA.map(cached => H.getValidHierarchyPart(toActual(cached, resultRecord), cached)),
    //   )
    // ),
    // SRTE.map(logReturnS(res => res.map(showResult).join(', '))),
  )

  return res
}

const showDetails = (detals: Details) => {
  return `${detals.type} ${fileName(detals)}. items: [${detals.items.map(fileName)}]`
}

const concatCachedWithValidated = (
  cached: V.GetByPathResult,
  validated: H.WithDetails<H.Hierarchy>,
): V.GetByPathResult => {
  if (cached.valid) {
    // the path is fully cached
    // and the result fully depends on the validation result
    if (H.isValid(validated)) {
      // we need to verify if the validated hierarchy contains file if that was in the cached

      if (O.isSome(cached.file)) {
        const fname = fileName(cached.file.value)
        const parent = NA.last(validated.details)

        return pipe(
          findInParent(parent, fileName(cached.file.value)),
          O.fold(
            () => E.left(NotFoundError.createTemplate(fname, parent.drivewsid)),
            (actualFileItem) => {
              return isFileItem(actualFileItem)
                ? E.of(actualFileItem)
                : E.left(ItemIsNotFileError.createTemplate(actualFileItem))
            },
          ),
          E.fold(
            (e) =>
              V.invalidResult(
                H.partialPath(validated.details, [fname]),
                e,
              ),
            file => V.validResult(validated.details, O.some(file)),
          ),
        )
      }
      else {
        logger.debug(`V.validResult: ${showDetails(NA.last(validated.details))}`)
        return V.validResult(validated.details)
      }
    }
    else {
      //
      return V.invalidResult(validated, err(`the path changed`))
    }
  }
  else {
    // the path is only partially cached
    if (H.isValid(validated)) {
      // the cached part of the path is valid
      return V.invalidResult(
        H.partialPath(
          validated.details,
          cached.path.rest,
        ),
        cached.error,
      )
    }
    else {
      /*
      the cached part of the path is only partially valid

      cached
      [/ dir0 dir1 dir2 ] [ dir3 file1 ]
      validated
      [ / dir0 dir1 ] [ dir2 ]
      result
      [ / dir0 dir1 ] [ dir2 dir3 file1 ]
      */

      return V.invalidResult(
        H.partialPath(
          validated.details,
          NA.concat(validated.rest, cached.path.rest),
        ),
        err(`the path changed`),
      )
    }
  }
}

/** validates cached entities returning the parts that are not changed */
export const validateCachedPaths = (
  paths: NEA<NormalizedPath>,
): DF.DriveM<NEA<V.GetByPathResult>> => {
  return pipe(
    logg(`validateCachedPaths: ${paths}`),
    () => DF.readEnv,
    SRTE.bind('cached', ({ cache }) =>
      pipe(
        SRTE.fromEither(
          pipe(paths, NA.map(cache.getByPathVE), E.sequenceArray, E.map(_ => _ as NEA<V.GetByPathResult>)),
        ),
      )),
    SRTE.chain(({ cached }) =>
      pipe(
        logg(`cached: ${cached.map(V.showGetByPathResult).join('      &&      ')}`),
        () => validateHierarchies(pipe(cached, NA.map(_ => _.path.details))),
        SRTE.map(NA.zip(cached)),
        SRTE.map(NA.map(([validated, cached]): V.GetByPathResult => {
          /* by this moment we have validated hierarchy the path (excluding file) */
          return concatCachedWithValidated(cached, validated)
        })),
      )
    ),
    DF.logS(paths => `result: [${paths.map(V.showGetByPathResult).join(', ')}]`),
  )
}

type LssResult = V.GetByPathResult

const handleFiles = (
  [item, [rest, partial]]: [O.Some<DriveChildrenItemFile>, [string[], V.GetByPathResultInvalid]],
): V.GetByPathResult => {
  return pipe(
    rest,
    A.match(
      // if the rest is empty the file is the target
      (): V.GetByPathResultValid => ({ valid: true, file: item, path: H.validPath(partial.path.details) }),
      // otherwise this is mistake to try to enter the file as a into a folder
      (rest): V.GetByPathResult => ({
        valid: false,
        error: ItemIsNotFolderError.create(`item is not folder`),
        path: H.partialPath(partial.path.details, NA.concat([fileName(item.value)], rest)),
      }),
    ),
  )
}
// filter out files with empty rest - they are valid
// filter out files with non empty rest - they are invalid

// retrieve details for folders with empty rest (valid)
// go deeper for incomplete paths (rest is non empty)

// so next task is
type DepperFolders =
  // folders items with empty rest (valid, requires details)
  | [O.Some<DriveChildrenItemFolder | DriveChildrenItemAppLibrary>, [[], V.GetByPathResultInvalid]]
  // folders items with non empty rest (incomplete paths)
  | [O.Some<DriveChildrenItemFolder | DriveChildrenItemAppLibrary>, [NEA<string>, V.GetByPathResultInvalid]]

const handleFolders = (task: NEA<DepperFolders>): DF.DriveM<NEA<LssResult>> => {
  logger.debug(`handleFolders: ${
    task.map(([item, [rest, partial]]) => {
      return `item: ${fileName(item.value)}. rest: [${rest}]`
    })
  }`)

  const foldersToRetrieve = pipe(
    task,
    NA.map(([item, [rest, validPart]]) => item.value.drivewsid),
  )

  return pipe(
    // retrieve folders
    DF.retrieveItemDetailsInFoldersSavingE(foldersToRetrieve),
    // return valid path for folders with empty rest since they are targets
    // go deeper for non empty rests
    DF.map(NA.zip(task)),
    DF.chain((details) => {
      return modifySubsetDF(
        details,
        // select all the non empty rests
        (v): v is [
          DriveDetailsWithHierarchy,
          [O.Some<DriveChildrenItemFolder | DriveChildrenItemAppLibrary>, [NEA<string>, V.GetByPathResultInvalid]],
        ] => pipe(v, ([details, [item, [rest, partial]]]) => A.isNonEmpty(rest)),
        (task) => {
          return pipe(
            task,
            NA.map(([details, [item, [rest, partial]]]): V.GetByPathResultInvalid =>
              V.invalidResult(
                H.partialPath(
                  H.concat(partial.path.details, [details]),
                  rest,
                ),
                err(`we need to go deepr)`),
              )
            ),
            retrivePartials,
          )
        },
        // the details is the target
        ([details, [item, [rest, partial]]]): V.GetByPathResultValid => {
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

const handleItems = (
  found: NEA<[O.Some<DriveChildrenItem>, [string[], V.GetByPathResultInvalid]]>,
): DF.DriveM<LssResult[]> => {
  logger.debug(`handleItems. ${
    found.map(([item, [rest, partial]]) => {
      return `item: ${fileName(item.value)}.`
    })
  }`)

  const filterFolders = (
    v: [O.Some<DriveChildrenItem>, [string[], V.GetByPathResultInvalid]],
  ): v is DepperFolders => {
    return isFolderLikeItem(v[0].value)
  }

  if (A.isNonEmpty(found)) {
    return modifySubsetDF(found, filterFolders, handleFolders, handleFiles)
  }

  return DF.of([])
}

const retrivePartials = (
  partialPaths: NEA<V.GetByPathResultInvalid>,
): DF.DriveM<NEA<V.GetByPathResult>> => {
  logger.debug(`retrivePartials: ${partialPaths.map(V.showGetByPathResult)}`)

  const subItems = pipe(
    partialPaths,
    NA.map(_ => findInParent(NA.last(_.path.details), NA.head(_.path.rest))),
    NA.zip(pipe(partialPaths, NA.map(_ => NA.tail(_.path.rest)), NA.zip(partialPaths))),
  )

  return modifySubsetDF(
    subItems,
    // select items that were found
    (v): v is [O.Some<DriveChildrenItem>, [string[], V.GetByPathResultInvalid]] => pipe(v, fst, O.isSome),
    handleItems,
    // for others create NotFoundError
    ([item, [rest, partial]]: [O.None, [string[], V.GetByPathResultInvalid]]): LssResult => {
      return {
        valid: false,
        error: NotFoundError.createTemplate(
          NA.head(partial.path.rest),
          fileName(NA.last(partial.path.details)),
        ),
        path: partial.path,
      }
    },
  )
}

const getActuals = (
  results: NEA<[V.GetByPathResult, NormalizedPath]>,
): DF.DriveM<NEA<V.GetByPathResult>> => {
  logger.debug(
    `getActuals: ${results.map(([p, path]) => `for ${path}. so far we have: ${V.showGetByPathResult(p)}`)}`,
  )
  return pipe(
    modifySubsetDF(
      results,
      // select incomplete hierarchies
      (res): res is [V.GetByPathResultInvalid, NormalizedPath] => !res[0].valid,
      (subset: NEA<[V.GetByPathResultInvalid, NormalizedPath]>) => {
        const partials = pipe(subset, NA.map(fst))
        return pipe(partials, retrivePartials)
      },
      // just return all the valid results
      ([h, p]: [V.GetByPathResultValid, NormalizedPath]): LssResult => h,
    ),
  )
}

export const getByPaths = (
  paths: NEA<NormalizedPath>,
): DF.DriveM<NEA<LssResult>> => {
  const res = pipe(
    logg(`getByPath. ${paths}`),
    // the domain logic implies there is root details in cache
    () =>
      pipe(
        DF.retrieveRootIfMissing(),
        // DF.removeByIds([rootDrivewsid]),
        // DF.chain(() => DF.retrieveRootIfMissing()),
      ),
    DF.chain(() => validateCachedPaths(paths)),
    SRTE.map(NA.zip(paths)),
    SRTE.chain(getActuals),
  )

  return res
}

export const lsss = (
  paths: NEA<NormalizedPath>,
): DF.DriveM<NEA<LssResult>> => {
  return getByPaths(paths)
}

export const lsssG = <TRoot extends Root>(
  paths: NEA<NormalizedPath>,
): DF.DriveM<NEA<LssResult>> => {
  return getByPaths(paths)
}
