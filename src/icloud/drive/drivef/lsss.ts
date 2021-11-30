import { identity } from 'fp-ts'
import * as A from 'fp-ts/lib/Array'
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
import { hierarchyToPath, itemWithHierarchyToPath, NormalizedPath } from '../../../cli/actions/helpers'
import { err } from '../../../lib/errors'
import { modifySubset, modifySubsetDF } from '../../../lib/helpers/projectIndexes'
import { logf, logg, logger, logReturn, logReturnAs, logReturnS } from '../../../lib/logging'
import { NEA } from '../../../lib/types'
import { cast, Path } from '../../../lib/util'
import { Cache, GetByPathVEResult, showGetByPathVEResult } from '../cache/Cache'
import * as C from '../cache/cachef'
import { CacheEntity, CacheEntityFolderLike } from '../cache/types'
import { findInParent, partialPath, PartialyCached } from '../cache/validatePath'
import { ItemIsNotFolder, NotFoundError } from '../errors'
import * as DF from '../fdrive'
import { fileName, recordFromTuples } from '../helpers'
import {
  DriveChildrenItem,
  DriveChildrenItemAppLibrary,
  DriveChildrenItemFile,
  DriveChildrenItemFolder,
  DriveDetails,
  DriveDetailsRoot,
  DriveDetailsWithHierarchy,
  DriveFolderLike,
  // Hierarchy,
  HierarchyItem,
  isFolderDetails,
  isFolderDrivewsid,
  isFolderHierarchyEntry,
  isFolderLikeItem,
  isRootDetails,
} from '../types'
import { HierarchyEntry } from '../types'
import { driveDetails } from '../types-io'
import { lookupCache } from './lookupCache'
import { log } from './ls'
// import { getValidHierarchyPart, ValidatedHierarchy } from './validation'
import * as H from './validation'

type DetailsOrFile = (DriveDetails | DriveChildrenItemFile)

const equalsDrivewsId = fromEquals((a: { drivewsid: string }, b: { drivewsid: string }) => a.drivewsid == b.drivewsid)

const toActual = (
  cachedHierarchy: H.Hierarchy,
  actualsRecord: Record<string, O.Option<DriveDetails>>,
): [DriveDetailsRoot, ...O.Option<DriveDetails>[]] => {
  return pipe(
    cachedHierarchy,
    A.dropLeft(1),
    A.map(h => R.lookup(h.drivewsid)(actualsRecord)),
    A.map(O.flatten),
    details => [cachedHierarchy[0], ...details],
  )
}

const showHierarchiy = (h: H.Hierarchy) => {
  const [root, ...rest] = h

  return `${isRootDetails(root) ? 'root' : '<!not root!>'}/${rest.join('/')}`
}

export const validateHierarchies = (
  cachedHierarchies: NEA<H.Hierarchy>,
): DF.DriveM<NEA<H.WithDetails>> => {
  const drivewsids = pipe(
    cachedHierarchies,
    NA.flatten,
    NA.uniq(equalsDrivewsId),
    NA.map(_ => _.drivewsid),
  )

  const res = pipe(
    logg(`validateHierarchies: [${cachedHierarchies.map(showHierarchiy)}]`),
    () => DF.retrieveItemDetailsInFoldersSavingNEA(drivewsids),
    SRTE.map(ds => NA.zip(drivewsids, ds)),
    SRTE.map(recordFromTuples),
    SRTE.map(resultRecord =>
      pipe(
        cachedHierarchies,
        NA.map(cached => H.getValidHierarchyPart(toActual(cached, resultRecord), cached)),
      )
    ),
    // SRTE.map(logReturnS(res => res.map(showResult).join(', '))),
  )

  return res
}

export const validateCachedPaths = (
  paths: NEA<NormalizedPath>,
): DF.DriveM<NEA<H.WithDetails>> => {
  return pipe(
    logg(`validateCachedPaths: ${paths}`),
    () => DF.readEnv,
    SRTE.bind('cached', ({ cache }) =>
      pipe(
        SRTE.fromEither(
          pipe(paths, NA.map(cache.getByPathVE), E.sequenceArray, E.map(_ => _ as NEA<GetByPathVEResult>)),
        ),
        // DF.logS(ps => `${ps.map(showGetByPathVEResult)}`),
      )),
    SRTE.chain(({ cached }) =>
      pipe(
        logg(`cached: ${cached.map(showGetByPathVEResult)}`),
        () => validateHierarchies(pipe(cached, NA.map(_ => _.path.left))),
        SRTE.map(NA.zip(cached)),
        SRTE.map(NA.map(([validated, cached]): H.WithDetails =>
          // H.isValid(cached.valid)
          cached.valid
            ? validated
            : H.isValid(validated)
            ? H.partial(validated.left, cached.path.right)
            : H.partial(
              [...validated.left, ...cached.path.left],
              NA.concat(validated.right, cached.path.right),
            )
        )),
      )
    ),
    DF.logS(paths => `result: ${paths.map(H.showMaybeValidPath)}`),
  )
}

// try to find the rest, returning rest if it's not found
/*
*/
// C.getPartialValidPath

// type PartialPath = C.PartialValidPath<DetailsOrFile, DriveDetails>

type PartialPath = H.Partial

type LssResult =
  | { valid: true; target: DetailsOrFile }
  | { valid: false; validPart: NEA<DriveDetails>; rest: NEA<string>; error: Error }

const handleFiles = (
  [item, [rest, partial]]: [O.Some<DriveChildrenItemFile>, [string[], PartialPath]],
): LssResult => {
  return pipe(
    rest,
    A.match(
      (): LssResult => ({ valid: true, target: item.value }),
      (rest): LssResult => ({
        valid: false,
        error: ItemIsNotFolder.create(`item is not folder`),
        rest,
        validPart: partial.left,
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
  | [O.Some<DriveChildrenItemFolder | DriveChildrenItemAppLibrary>, [[], PartialPath]]
  // folders items with non empty rest (incomplete paths)
  | [O.Some<DriveChildrenItemFolder | DriveChildrenItemAppLibrary>, [NEA<string>, PartialPath]]

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
        (v): v is [
          DriveDetailsWithHierarchy,
          [O.Some<DriveChildrenItemFolder | DriveChildrenItemAppLibrary>, [NEA<string>, PartialPath]],
        ] => pipe(v, ([details, [item, [rest, partial]]]) => A.isNonEmpty(rest)),
        (task) => {
          return pipe(
            task,
            NA.map(([details, [item, [rest, partial]]]): H.Partial =>
              H.partial(
                H.concat(partial.left, details),
                rest,
              )
            ),
            retrivePartials,
          )
        },
        ([details, [item, [rest, partial]]]): LssResult => {
          return { valid: true, target: details }
        },
      )
    }),
  )
}

const handleItems = (
  found: NEA<[O.Some<DriveChildrenItem>, [string[], PartialPath]]>,
): DF.DriveM<LssResult[]> => {
  logger.debug(`handleItems. ${
    found.map(([item, [rest, partial]]) => {
      return `item: ${fileName(item.value)}.`
    })
  }`)

  const isNextTask = (
    v: [O.Some<DriveChildrenItem>, [string[], PartialPath]],
  ): v is DepperFolders => {
    return isFolderLikeItem(v[0].value)
  }

  if (A.isNonEmpty(found)) {
    return modifySubsetDF(found, isNextTask, handleFolders, handleFiles)
  }

  return DF.of([])
}

const retrivePartials = (
  partialPaths: NEA<H.Partial>,
): DF.DriveM<NEA<LssResult>> => {
  logger.debug(`retrivePartials: ${partialPaths.map(H.showMaybeValidPath)}`)

  const subItems = pipe(
    partialPaths,
    NA.map(_ => findInParent(NA.last(_.left), NA.head(_.right))),
    NA.zip(pipe(partialPaths, NA.map(_ => NA.tail(_.right)), NA.zip(partialPaths))),
  )

  return modifySubsetDF(
    subItems,
    (v): v is [O.Some<DriveChildrenItem>, [string[], PartialPath]] => pipe(v, fst, O.isSome),
    handleItems,
    ([item, [rest, partial]]): LssResult => {
      return {
        valid: false,
        error: NotFoundError.createTemplate(
          NA.head(partial.right),
          fileName(NA.last(partial.left)),
        ),
        rest: partial.right,
        validPart: partial.left,
      }
    },
  )
}

const getActuals = (
  results: NEA<[H.MaybeValidPath, NormalizedPath]>,
): DF.DriveM<NEA<LssResult>> => {
  logger.debug(`getActuals: ${results.map(([p, path]) => `for ${path}. so far we have: ${H.showMaybeValidPath(p)}`)}`)
  // what do we do when MaybeValidPath has no valid starting details?
  return pipe(
    modifySubsetDF(
      results,
      // select incomplete hierarchies
      (res): res is [H.Partial, NormalizedPath] => H.isPartial(res[0]),
      (subset) => {
        const partials = pipe(subset, NA.map(fst))
        return pipe(partials, retrivePartials)
      },
      ([h, p]: [H.Valid, NormalizedPath]): LssResult => ({ valid: true, target: NA.last(h.left) }),
    ),
  )
}

const retrieveRootIfMissing = (): DF.DriveM<void> => {
  return pipe(
    DF.getRoot(),
    DF.map(constVoid),
  )
}

export const getByPaths = (
  paths: NEA<NormalizedPath>,
): DF.DriveM<NEA<LssResult>> => {
  const res = pipe(
    logg(`getByPath. ${paths}`),
    () => retrieveRootIfMissing(),
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
