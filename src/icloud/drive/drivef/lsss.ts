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
import { Cache } from '../cache/Cache'
import * as C from '../cache/cachef'
import { CacheEntity, CacheEntityFolderLike } from '../cache/types'
import { findInParent, PartialyCached } from '../cache/validatePath'
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

// type ValidatedHierarchy = {
//   validPart: DriveDetails[]
//   rest: string[]
// }

const showHierarchiy = (h: Hierarchy) => {
  return h.map(fileName).join('->')
}

// const showResult = (res: ValidatedHierarchy) => {
//   return `validPart: ${res.validPart.map(fileName)}, rest: ${res.rest}`
// }

const showPartialValid = (pv: { validPart: CacheEntity[]; rest: string[] }) => {
  return pv.rest.length == 0
    ? `valid: ${showValidPart(pv.validPart)}`
    : `partial: ${showValidPart(pv.validPart)}, rest: ${pv.rest}`
}

const showValidPart = (vp: CacheEntity[]) =>
  pipe(
    vp,
    A.map(_ => _.content),
    _ => _.length > 0 ? hierarchyToPath(_) : '',
  )

const equalsDrivewsId = fromEquals((a: { drivewsid: string }, b: { drivewsid: string }) => a.drivewsid == b.drivewsid)

const toActual = (
  h: NEA<DriveDetails>,
  actualsRecord: Record<string, O.Option<DriveDetails>>,
): NEA<O.Option<DriveDetails>> => {
  return pipe(
    h,
    NA.map(h => R.lookup(h.drivewsid)(actualsRecord)),
    NA.map(O.flatten),
  )
}

type Hierarchy = [DriveDetailsRoot, ...DriveDetails[]]
const isHierarchy = (details: NEA<DriveDetails>): details is Hierarchy => isRootDetails(details[0])

export const validateHierarchies = (
  hierarchies: NEA<Hierarchy>,
): DF.DriveM<NEA<H.MaybeValidPath>> => {
  const drivewsids = pipe(
    hierarchies,
    NA.flatten,
    NA.uniq(equalsDrivewsId),
    NA.map(_ => _.drivewsid),
  )

  const res = pipe(
    logg(`validateHierarchies: [${hierarchies.map(showHierarchiy)}]`),
    () => DF.retrieveItemDetailsInFoldersSaving(drivewsids),
    SRTE.map(ds => NA.zip(drivewsids, ds as NEA<O.Option<DriveDetailsWithHierarchy>>)),
    SRTE.map(recordFromTuples),
    SRTE.map(resultRecord =>
      pipe(
        hierarchies,
        NA.map(cached => H.getValidHierarchyPart(toActual(cached, resultRecord), cached)),
      )
    ),
    // SRTE.map(logReturnS(res => res.map(showResult).join(', '))),
  )

  return res
}

type V =
  | {
    readonly tag: 'full'
    path: NEA<DriveDetails>
    file: O.Option<DriveChildrenItemFile>
  }
  | (PartialyCached & {
    path: NEA<DriveDetails>
  })

export const validateCachedPaths = (
  paths: NEA<NormalizedPath>,
): DF.DriveM<NEA<H.WithDetails>> => {
  const res = pipe(
    logg(`validateCachedPaths: ${paths}`),
    () => DF.readEnv,
    SRTE.bind('cached', ({ cache }) =>
      SRTE.fromEither(
        pipe(
          paths,
          NA.map(cache.getByPathV3),
          E.fromPredicate(
            (partials): partials is NEA<H.WithDetails> => pipe(partials, A.every(H.isWithDetails)),
            () => err(`missing root in cache?`),
          ),
        ),
      )),
    SRTE.chain(({ cached }) =>
      pipe(
        // logReturnS(c => `getByPathV: ${c.map(showPartialValid)}`),
        // modifySubsetDF(
        //   cached,
        //   // select non empty validparts
        //   (p): p is V => A.isNonEmpty(p.path),
        //   (hs: NEA<V>) => validateHierarchies(pipe(hs, NA.map(_ => _.path))),
        //   (p: PartialyCached) => T.right(p.rest),
        // ),
        validateHierarchies(pipe(cached, NA.map(_ => _.left))),
        SRTE.map(NA.zip(cached)),
        SRTE.map(NA.map(([validated, cached]) =>
          H.isValid(cached)
            ? validated
            : pipe(
              validated,
              T.match(
                (details) => H.fromPartAndRest(details, cached.right),
                (rest) => H.fromPartAndRest([], [...rest, ...cached.right]),
                (details, rest) =>
                  H.fromPartAndRest(
                    [...details, ...cached.left],
                    [...rest, ...cached.right],
                  ),
              ),
            )
        )),
      )
    ),
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

const handleItems = (
  found: NEA<[O.Some<DriveChildrenItem>, [string[], PartialPath]]>,
): DF.DriveM<LssResult[]> => {
  // filter out files with empty rest - they are valid
  // filter out files with non empty rest - they are invalid

  // retrieve details for folders with empty rest (valid)
  // go deeper for incomplete paths (rest is non empty)

  // so next task is
  type NextTask =
    // folders items with empty rest (valid, requires details)
    | [O.Some<DriveChildrenItemFolder | DriveChildrenItemAppLibrary>, [[], PartialPath]]
    // folders items with non empty rest (incomplete paths)
    | [O.Some<DriveChildrenItemFolder | DriveChildrenItemAppLibrary>, [NEA<string>, PartialPath]]

  const isNextTask = (
    v: [O.Some<DriveChildrenItem>, [string[], PartialPath]],
  ): v is NextTask => {
    return isFolderLikeItem(v[0].value)
  }

  const handleFolders = (task: NEA<NextTask>): DF.DriveM<NEA<LssResult>> => {
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
          ] => pipe(v, ([details, [item, [rest, partial]]]) => H.isWithRest(partial)),
          (task) => {
            return pipe(
              task,
              NA.map(([details, [item, [rest, partial]]]): H.Partial =>
                H.partial(
                  NA.concat(partial.left, NA.of(details)),
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

  if (A.isNonEmpty(found)) {
    return modifySubsetDF(found, isNextTask, handleFolders, handleFiles)
  }

  return DF.of([])
}

const retrivePartials = (
  partialPaths: NEA<H.Partial>,
  // partialPaths: NEA<H.WithRest>,
): DF.DriveM<NEA<LssResult>> => {
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
        error: NotFoundError.createTemplate(NA.head(partial.right), fileName(NA.last(partial.left))),
        rest: partial.right,
        validPart: partial.left,
      }
    },
  )
}

const getActuals = (
  results: NEA<[H.MaybeValidPath, NormalizedPath]>,
): DF.DriveM<NEA<LssResult>> => {
  // what do we do when MaybeValidPath has no valid starting details?
  return pipe(
    modifySubsetDF(
      results,
      // select incomplete hierarchies
      (res): res is [H.WithRest, NormalizedPath] => H.isWithRest(res[0]),
      (subset) => {
        const partials = pipe(
          subset,
          NA.map(fst),
        )

        return pipe(
          partials,
          NA.map((_): PartialPath => ({ rest: _.right, validPart })),
          retrivePartials,
        )
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
    // SRTE.map(A.map(([{ rest, validPart }, path]) => getPath(path, validPart, rest))),
    // SRTE.chain(SRTE.sequenceArray),
    // SRTE.map(RA.toArray),
  )

  return res
}

export const lss = (
  paths: NEA<NormalizedPath>,
): DF.DriveM<NEA<LssResult>> => {
  return getByPaths(paths)
}
