import * as A from 'fp-ts/lib/Array'
import { fromEquals } from 'fp-ts/lib/Eq'
import { hole, pipe } from 'fp-ts/lib/function'
import * as NA from 'fp-ts/lib/NonEmptyArray'
import * as O from 'fp-ts/lib/Option'
import * as RA from 'fp-ts/lib/ReadonlyArray'
import * as R from 'fp-ts/lib/Record'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { hierarchyToPath, itemWithHierarchyToPath, NormalizedPath } from '../../../cli/actions/helpers'
import { err } from '../../../lib/errors'
import { logf, logg, logger, logReturn, logReturnAs, logReturnS } from '../../../lib/logging'
import { Path } from '../../../lib/util'
import * as C from '../cache/cachef'
import { CacheEntityFolderLike, ICloudDriveCacheEntity } from '../cache/types'
import { ItemIsNotFolder } from '../errors'
import * as DF from '../fdrive'
import { fileName, recordFromTuples } from '../helpers'
import {
  DriveChildrenItemFile,
  DriveDetails,
  DriveDetailsWithHierarchy,
  DriveFolderLike,
  Hierarchy,
  HierarchyItem,
  isFolderDetails,
} from '../types'
import { HierarchyEntry } from '../types'
import { lookupCache } from './lookupCache'
import { log } from './ls'

type ValidatedHierarchy = { validPart: DriveDetailsWithHierarchy[]; rest: string[] }

const showHierarchiy = (h: Hierarchy) => {
  return h.map(fileName).join('->')
}

const showResult = (res: ValidatedHierarchy) => {
  return `validPart: ${res.validPart.map(fileName)}, rest: ${res.rest}`
}

const showPartialValid = (pv: C.PartialValidPath) => {
  return pv.valid ? `valid: ${showValidPart(pv.entities)}` : `partial: ${showValidPart(pv.validPart)}, rest: ${pv.rest}`
}

const showValidPart = (vp: ICloudDriveCacheEntity[]) =>
  pipe(
    vp,
    A.map(_ => _.content),
    _ => _.length > 0 ? hierarchyToPath(_) : '',
  )

const equalsDrivewsId = fromEquals((a: { drivewsid: string }, b: { drivewsid: string }) => a.drivewsid == b.drivewsid)

export const validateHierarchies = (
  hierarchies: Hierarchy[],
): DF.DriveM<ValidatedHierarchy[]> => {
  const drivewsids = pipe(
    hierarchies,
    A.flatten,
    A.uniq(equalsDrivewsId),
    A.map(_ => _.drivewsid),
  )

  const toActual = (
    h: Hierarchy,
    actuals: Record<string, O.Option<DriveDetailsWithHierarchy>>,
  ): O.Option<DriveDetailsWithHierarchy>[] => {
    return pipe(
      h,
      A.map(h => R.lookup(h.drivewsid)(actuals)),
      A.map(O.flatten),
    )
  }

  return pipe(
    logg(`validateHierarchies: ${hierarchies.map(showHierarchiy)}`),
    () => DF.retrieveItemDetailsInFoldersSaving(drivewsids),
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

export const validateCachedPaths = (
  paths: NormalizedPath[],
): DF.DriveM<ValidatedHierarchy[]> => {
  return pipe(
    logg(`validateCachedPaths: ${paths}`),
    () => DF.readEnv,
    SRTE.bind('cached', ({ cache }) => SRTE.of(paths.map(cache.getByPathV))),
    SRTE.chain(({ cached }) =>
      pipe(
        cached,
        logReturnS(c => `getByPathV: ${c.map(showPartialValid)}`),
        A.map(c =>
          c.valid
            ? C.entitiesToHierarchy(c.entities)
            : C.entitiesToHierarchy(c.validPart)
        ),
        validateHierarchies,
        SRTE.map(A.zip(cached)),
        SRTE.map(A.map(([v, c]) =>
          c.valid
            ? v
            : ({
              validPart: v.validPart,
              rest: pipe(
                c.validPart,
                A.dropLeft(v.validPart.length),
                A.map(_ => fileName(_.content)),
                files => [...files, ...c.rest],
              ),
            })
        )),
      )
    ),
  )
}

export const getByPaths = (
  paths: NormalizedPath[],
): DF.DriveM<(DriveChildrenItemFile | DriveDetails)[]> => {
  const res = pipe(
    logg(`getByPath. ${paths}`),
    () => validateCachedPaths(paths),
    SRTE.map(A.zip(paths)),
    SRTE.map(
      A.map(
        ([{ rest, validPart }, path]) =>
          pipe(
            A.isNonEmpty(validPart)
              ? DF.getActualRelative(rest, NA.last(validPart))
              : DF.getActual(path),
          ),
      ),
    ),
    SRTE.chain(SRTE.sequenceArray),
    SRTE.map(RA.toArray),
  )

  return res
}

export const lss = (paths: NormalizedPath[]): DF.DriveM<(DriveChildrenItemFile | DriveDetails)[]> => {
  return getByPaths(paths)
}

/*
retrieve paths along with additional drivewsids to cache
*/
export const lssA = (
  paths: NormalizedPath[],
  additional: string[],
): DF.DriveM<(DriveChildrenItemFile | DriveDetails)[]> => {
  return getByPaths(paths)
}
