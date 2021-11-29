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
import { findInParent } from '../cache/validatePath'
import { ItemIsNotFolder, NotFoundError } from '../errors'
import * as DF from '../fdrive'
import { fileName, recordFromTuples } from '../helpers'
import {
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
} from '../types'
import { HierarchyEntry } from '../types'
import { driveDetails } from '../types-io'
import { lookupCache } from './lookupCache'
import { log } from './ls'

type DetailsOrFile = (DriveDetails | DriveChildrenItemFile)

type ValidatedHierarchy = {
  validPart: NA.NonEmptyArray<DriveDetails>
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
  h: Hierarchy,
  actuals: Record<string, O.Option<DetailsOrFile>>,
): O.Option<DetailsOrFile>[] => {
  return pipe(
    h,
    A.map(h => R.lookup(h.drivewsid)(actuals)),
    A.map(O.flatten),
  )
}

export const validateHierarchies = (
  hierarchies: DriveDetails[][],
): DF.DriveM<ValidatedHierarchy[]> => {
  const drivewsids = pipe(
    hierarchies,
    A.flatten,
    A.uniq(equalsDrivewsId),
    A.map(_ => _.drivewsid),
  )

  return pipe(
    logg(`validateHierarchies: [${hierarchies.map(showHierarchiy)}]`),
    () =>
      drivewsids.length > 0
        ? DF.retrieveItemDetailsInFoldersSaving(drivewsids)
        : DF.of([]),
    SRTE.map(ds => A.zip(drivewsids, ds)),
    SRTE.map(recordFromTuples),
    SRTE.map(result =>
      pipe(
        hierarchies,
        A.map(h =>
          pipe(
            toActual(h, result),
            a => DF.getValidHierarchyPart(a, h),
          )
        ),
      )
    ),
    SRTE.map(logReturnS(res => res.map(showResult).join(', '))),
  )
}

const getPath = (
  path: NormalizedPath,
  validPart: DetailsOrFile[],
  rest: string[],
) => {
  return pipe(
    validPart,
    A.matchRight(
      () => DF.getActual(path),
      (_, last) =>
        isFolderDetails(last)
          ? DF.getActualRelative(rest, last)
          : pipe(
            _.at(-1),
            O.fromNullable,
            O.fold(
              () => SRTE.left(err(`invalid hierarchy`)),
              parent =>
                isFolderDetails(parent)
                  ? DF.getActualRelative([fileName(last)], parent)
                  : SRTE.left(err(`invalid hierarchy`)),
            ),
          ),
    ),
  )
}

export const validateCachedPaths = (
  paths: NormalizedPath[],
): DF.DriveM<ValidatedHierarchy[]> => {
  return pipe(
    logg(`validateCachedPaths: ${paths}`),
    () => DF.readEnv,
    SRTE.bind('cached', ({ cache }) => SRTE.of(paths.map(cache.getByPathV3))),
    SRTE.chain(({ cached }) =>
      pipe(
        cached,
        // logReturnS(c => `getByPathV: ${c.map(showPartialValid)}`),
        A.map(c => c.path),
        validateHierarchies,
        SRTE.map(A.zip(cached)),
        SRTE.map(A.map(([v, c]) =>
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
type R = [{
  validPart: NA.NonEmptyArray<DriveDetails>
  rest: NA.NonEmptyArray<string>
}, NormalizedPath]

const retrivePartials = (
  partials: NA.NonEmptyArray<{
    validPart: NA.NonEmptyArray<DriveDetails>
    rest: NA.NonEmptyArray<string>
  }>,
): DF.DriveM<O.Option<DetailsOrFile>[]> => {
  const parents = pipe(
    partials,
    NA.map(_ => NA.last(_.validPart)),
    // NA.map(_ => ({ parent: NA.last(_.validPart), rest: _.rest })),
  )

  const drivewsids = pipe(parents, NA.map(_ => _.drivewsid))

  pipe(
    partials,
    NA.map(_ => findInParent(NA.last(_.validPart), NA.head(_.rest))),
  )
}

const getActuals = (results: [ValidatedHierarchy, NormalizedPath][]): DF.DriveM<
  O.Option<DetailsOrFile>[]
> => {
  pipe(
    modifySubsetDF(
      results,
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
    ),
  )
}

export const getByPaths = (
  paths: NormalizedPath[],
): DF.DriveM<O.Option<DetailsOrFile>[]> => {
  const res = pipe(
    logg(`getByPath. ${paths}`),
    () => validateCachedPaths(paths),
    SRTE.map(A.zip(paths)),
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
