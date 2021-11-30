import { identity } from 'fp-ts'
import * as A from 'fp-ts/lib/Array'
import * as E from 'fp-ts/lib/Either'
import { fromEquals } from 'fp-ts/lib/Eq'
import { constant, flow, hole, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { fst, snd } from 'fp-ts/lib/Tuple'
import { hierarchyToPath, itemWithHierarchyToPath, NormalizedPath } from '../../../cli/actions/helpers'
import { err } from '../../../lib/errors'
import { modifySubset, modifySubsetDF } from '../../../lib/helpers/projectIndexes'
import { logf, logg, logger, logReturn, logReturnAs, logReturnS } from '../../../lib/logging'
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
  Hierarchy,
  HierarchyItem,
  isFolderDetails,
  isFolderDrivewsid,
  isFolderHierarchyEntry,
  isFolderLikeItem,
} from '../types'
import { HierarchyEntry } from '../types'
import { driveDetails } from '../types-io'
import { lookupCache } from './lookupCache'
import { log } from './ls'
import { getValidHierarchyPart } from './validation'

type DetailsOrFile = (DriveDetails | DriveChildrenItemFile)

type ValidatedHierarchy = {
  validPart: DriveDetails[]
  rest: string[]
}

const showHierarchiy = (h: Hierarchy) => {
  return h.map(fileName).join('->')
}

const showResult = (res: ValidatedHierarchy) => {
  return `validPart: ${res.validPart.map(fileName)}, rest: ${res.rest}`
}

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
  h: NA.NonEmptyArray<DriveDetails>,
  actualsRecord: Record<string, O.Option<DriveDetails>>,
): NA.NonEmptyArray<O.Option<DriveDetails>> => {
  return pipe(
    h,
    NA.map(h => R.lookup(h.drivewsid)(actualsRecord)),
    NA.map(O.flatten),
  )
}

export const validateHierarchies = (
  hierarchies: NA.NonEmptyArray<NA.NonEmptyArray<DriveDetails>>,
): DF.DriveM<NA.NonEmptyArray<ValidatedHierarchy>> => {
  const drivewsids = pipe(
    hierarchies,
    NA.flatten,
    NA.uniq(equalsDrivewsId),
    NA.map(_ => _.drivewsid),
  )

  const res = pipe(
    logg(`validateHierarchies: [${hierarchies.map(showHierarchiy)}]`),
    () => DF.retrieveItemDetailsInFoldersSaving(drivewsids),
    SRTE.map(ds => NA.zip(drivewsids, ds as NA.NonEmptyArray<O.Option<DriveDetailsWithHierarchy>>)),
    SRTE.map(recordFromTuples),
    SRTE.map(resultRecord =>
      pipe(
        hierarchies,
        NA.map(cached => getValidHierarchyPart(toActual(cached, resultRecord), cached)),
      )
    ),
    // SRTE.map(logReturnS(res => res.map(showResult).join(', '))),
  )

  return res
}

type V =
  | {
    readonly tag: 'full'
    path: NA.NonEmptyArray<DriveDetails>
    file: O.Option<DriveChildrenItemFile>
  }
  | (PartialyCached & {
    path: NA.NonEmptyArray<DriveDetails>
  })

export const validateCachedPaths = (
  paths: NA.NonEmptyArray<NormalizedPath>,
): DF.DriveM<NA.NonEmptyArray<ValidatedHierarchy>> => {
  return pipe(
    logg(`validateCachedPaths: ${paths}`),
    () => DF.readEnv,
    SRTE.bind('cached', ({ cache }) => SRTE.of(pipe(paths, NA.map(cache.getByPathV3)))),
    SRTE.chain(({ cached }) =>
      pipe(
        // logReturnS(c => `getByPathV: ${c.map(showPartialValid)}`),
        modifySubsetDF(
          cached,
          (p): p is V => A.isNonEmpty(p.path),
          hs => {
            return pipe(
              hs,
              A.match(
                (): DF.DriveM<ValidatedHierarchy[]> => DF.of([]),
                hs => validateHierarchies(pipe(hs, NA.map(_ => _.path))),
              ),
            )
          },
          (p: PartialyCached) => ({
            validPart: [],
            rest: p.rest,
          }),
        ),
        SRTE.map(NA.zip(cached)),
        SRTE.map(NA.map(([v, c]) =>
          c.tag === 'full'
            ? v
            : ({
              validPart: v.validPart,
              rest: pipe(
                c.path,
                A.dropLeft(v.validPart.length),
                A.map(_ => fileName(_)),
                files => [...files, ...c.rest],
              ),
            })
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

type PartialPath = {
  validPart: NA.NonEmptyArray<DriveDetails>
  rest: NA.NonEmptyArray<string>
}

type LssResult =
  | { valid: true; target: DetailsOrFile }
  | { valid: false; validPart: NA.NonEmptyArray<DriveDetails>; rest: NA.NonEmptyArray<string>; error: Error }

// pipe(
//   item,
//   O.fold(
//     (): LssResult => ({
//       valid: false,
//       validPart: partial.validPart,
//       rest: partial.rest,
//       error: NotFoundError.createTemplate(NA.head(partial.rest), fileName(NA.last(partial.validPart))),
//     }),
//     item => {},
//   ),
// )

// pipe(
//   rest,
//   A.match(
//     () => {},
//     rest => {},
//   ),
// )
const retrivePartials = (
  partialPaths: NA.NonEmptyArray<PartialPath>,
): DF.DriveM<NA.NonEmptyArray<LssResult>> => {
  const parents = pipe(
    partialPaths,
    NA.map(_ => NA.last(_.validPart)),
  )

  const drivewsids = pipe(parents, NA.map(_ => _.drivewsid))

  const subItems = pipe(
    partialPaths,
    NA.map(_ => findInParent(NA.last(_.validPart), NA.head(_.rest))),
    NA.zip(pipe(partialPaths, NA.map(_ => NA.tail(_.rest)), NA.zip(partialPaths))),
    // NA.map(([item, [rest, partial]]) => {
    // }),
  )

  const getWhatWasFound = (found: [O.Some<DriveChildrenItem>, [string[], PartialPath]][]): DF.DriveM<LssResult[]> => {
    const handleFiles = (files: [O.Some<DriveChildrenItemFile>, [string[], PartialPath]][]): LssResult[] => {
      return pipe(
        files,
        A.map(([item, [rest, partial]]) =>
          pipe(
            rest,
            A.match(
              (): LssResult => ({ valid: true, target: item.value }),
              (rest): LssResult => ({
                valid: false,
                error: ItemIsNotFolder.create(`item is not folder`),
                rest,
                validPart: partial.validPart,
              }),
            ),
          )
        ),
      )
    }

    // filter out files with empty rest - valid
    // filter out files with non empty rest - invalid

    // retrieve details for folders with empty rest (valid)
    // go deeper for incomplete paths (rest is non empty)

    // so next task is
    type NextTask =
      // folders items with empty rest (valid, requires details)
      | [O.Some<DriveChildrenItemFolder | DriveChildrenItemAppLibrary>, [[], PartialPath]]
      // folders items with non empty rest (incomplete paths)
      | [O.Some<DriveChildrenItemFolder | DriveChildrenItemAppLibrary>, [NA.NonEmptyArray<string>, PartialPath]]

    const isNextTask = (
      v: [O.Some<DriveChildrenItem>, [string[], PartialPath]],
    ): v is NextTask => {
      return isFolderLikeItem(v[0].value)
    }

    const handleTask = (task: NextTask[]): DF.DriveM<LssResult[]> => {
    }

    if (A.isNonEmpty(found)) {
      modifySubsetDF(
        found,
        isNextTask,
        handleTask,
        handleFiles,
      )
    }

    return DF.of([])
  }

  modifySubsetDF(
    subItems,
    (v): v is [O.Some<DriveChildrenItem>, [string[], PartialPath]] => pipe(v, fst, O.isSome),
    getWhatWasFound,
    ([item, [rest, partial]]) => {
      // return not found
    },
  )
}

type R = [{
  validPart: NA.NonEmptyArray<DriveDetails>
  rest: NA.NonEmptyArray<string>
}, NormalizedPath]

const getActuals = (
  results: NA.NonEmptyArray<[ValidatedHierarchy, NormalizedPath]>,
): DF.DriveM<NA.NonEmptyArray<LssResult>> => {
  pipe(
    modifySubsetDF(
      results,
      // filter valid hierarchies
      (res): res is R => res[0].rest.length > 0,
      (subset: R[]) => {
        const partials = pipe(
          subset,
          A.map(fst),
          // A.map(_ => _.validPart),
        )

        pipe(
          partials,
          A.match(() => DF.of([]), retrivePartials),
        )
      },
      _ => _,
    ),
  )
}

export const getByPaths = (
  paths: NA.NonEmptyArray<NormalizedPath>,
): DF.DriveM<NA.NonEmptyArray<LssResult>> => {
  const res = pipe(
    logg(`getByPath. ${paths}`),
    () => validateCachedPaths(paths),
    SRTE.map(NA.zip(paths)),
    SRTE.chain(getActuals),
    // SRTE.map(A.map(([{ rest, validPart }, path]) => getPath(path, validPart, rest))),
    // SRTE.chain(SRTE.sequenceArray),
    SRTE.map(RA.toArray),
  )

  return res
}

export const lss = (paths: NormalizedPath[]): DF.DriveM<DetailsOrFile[]> => {
  return getByPaths(paths)
}
