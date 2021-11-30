import assert from 'assert'
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
import { hierarchyToPath, itemWithHierarchyToPath, NormalizedPath } from '../../../cli/actions/helpers'
import { err } from '../../../lib/errors'
import { logf, logg, logger, logReturn, logReturnAs, logReturnS } from '../../../lib/logging'
import { cast, Path } from '../../../lib/util'
import { Cache } from '../cache/Cache'
import * as C from '../cache/cachef'
import { CacheEntity, CacheEntityFolderLike } from '../cache/types'
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
import { lsss } from './lsss'
import { getValidHierarchyPart } from './validation'

// type DetailsOrFile = (DriveDetails | DriveChildrenItemFile)

// type ValidatedHierarchy = {
//   validPart: DetailsOrFile[]
//   rest: string[]
// }

// const showHierarchiy = (h: Hierarchy) => {
//   return h.map(fileName).join('->')
// }

// const showResult = (res: ValidatedHierarchy) => {
//   return `validPart: ${res.validPart.map(fileName)}, rest: ${res.rest}`
// }

// const showPartialValid = (pv: { validPart: CacheEntity[]; rest: string[] }) => {
//   return pv.rest.length == 0
//     ? `valid: ${showValidPart(pv.validPart)}`
//     : `partial: ${showValidPart(pv.validPart)}, rest: ${pv.rest}`
// }

// const showValidPart = (vp: CacheEntity[]) =>
//   pipe(
//     vp,
//     A.map(_ => _.content),
//     _ => _.length > 0 ? hierarchyToPath(_) : '',
//   )

// const equalsDrivewsId = fromEquals((a: { drivewsid: string }, b: { drivewsid: string }) => a.drivewsid == b.drivewsid)

// const toActual = (
//   h: Hierarchy,
//   actuals: Record<string, O.Option<DetailsOrFile>>,
// ): O.Option<DetailsOrFile>[] => {
//   return pipe(
//     h,
//     A.map(h => R.lookup(h.drivewsid)(actuals)),
//     A.map(O.flatten),
//   )
// }

// export const validateHierarchies = (
//   hierarchies: Hierarchy[],
// ): DF.DriveM<ValidatedHierarchy[]> => {
//   const drivewsids = pipe(
//     hierarchies,
//     A.flatten,
//     A.uniq(equalsDrivewsId),
//     A.map(_ => _.drivewsid),
//     A.filter(isFolderDrivewsid),
//   )

//   return pipe(
//     logg(`validateHierarchies: [${hierarchies.map(showHierarchiy)}]`),
//     () =>
//       drivewsids.length > 0
//         ? DF.retrieveItemDetailsInFoldersSaving(drivewsids)
//         : DF.of([]),
//     SRTE.map(ds => A.zip(drivewsids, ds)),
//     SRTE.map(recordFromTuples),
//     SRTE.map(result =>
//       pipe(
//         hierarchies,
//         A.map(h =>
//           pipe(
//             toActual(h, result),
//             a => getValidHierarchyPart(a, h),
//           )
//         ),
//       )
//     ),
//     SRTE.map(logReturnS(res => res.map(showResult).join(', '))),
//   )
// }

// const getPath = (
//   path: NormalizedPath,
//   validPart: DetailsOrFile[],
//   rest: string[],
// ) => {
//   return pipe(
//     validPart,
//     A.matchRight(
//       () => DF.getActual(path),
//       (_, last) =>
//         isFolderDetails(last)
//           ? DF.getActualRelative(rest, last)
//           : pipe(
//             _.at(-1),
//             O.fromNullable,
//             O.fold(
//               () => SRTE.left(err(`invalid hierarchy`)),
//               parent =>
//                 isFolderDetails(parent)
//                   ? DF.getActualRelative([fileName(last)], parent)
//                   : SRTE.left(err(`invalid hierarchy`)),
//             ),
//           ),
//     ),
//   )

//   // return pipe(
//   //   validPart,
//   //   A.matchRight(
//   //     () => DF.getActual(path),
//   //     (_, last) => DF.getActualRelative(rest, last),
//   //   ),
//   // )
// }

// export const validateCachedPaths = (
//   paths: NormalizedPath[],
// ): DF.DriveM<ValidatedHierarchy[]> => {
//   return pipe(
//     logg(`validateCachedPaths: ${paths}`),
//     () => DF.readEnv,
//     SRTE.bind('cached', ({ cache }) => SRTE.of(paths.map(cache.getByPathV3))),
//     SRTE.chain(({ cached }) =>
//       pipe(
//         cached,
//         // logReturnS(c => `getByPathV: ${c.map(showPartialValid)}`),
//         A.map(c => c.path),
//         validateHierarchies,
//         SRTE.map(A.zip(cached)),
//         SRTE.map(A.map(([v, c]) =>
//           c.tag === 'full'
//             ? v
//             : ({
//               validPart: v.validPart,
//               rest: pipe(
//                 c.path,
//                 A.dropLeft(v.validPart.length),
//                 A.map(_ => fileName(_)),
//                 files => [...files, ...c.rest],
//               ),
//             })
//         )),
//       )
//     ),
//   )
// }

// // try to find the rest, returning rest if it's not found
// /*
// */
// // C.getPartialValidPath

// // type PartialPath = C.PartialValidPath<DetailsOrFile, DriveDetails>

// export const getByPaths = (
//   paths: NormalizedPath[],
// ): DF.DriveM<DetailsOrFile[]> => {
//   const res = pipe(
//     logg(`getByPath. ${paths}`),
//     () => validateCachedPaths(paths),
//     SRTE.map(A.zip(paths)),
//     SRTE.map(A.map(([{ rest, validPart }, path]) => getPath(path, validPart, rest))),
//     SRTE.chain(SRTE.sequenceArray),
//     SRTE.map(RA.toArray),
//   )

//   return res
// }
type DetailsOrFile = (DriveDetails | DriveChildrenItemFile)

export const lss = (paths: NormalizedPath[]): DF.DriveM<DetailsOrFile[]> => {
  // return getByPaths(paths)

  assert(A.isNonEmpty(paths))

  return pipe(
    lsss(paths),
    DF.chain(
      flow(
        NA.map(res =>
          res.valid
            ? DF.of(res.target)
            : DF.left<DetailsOrFile>(
              err(`error: ${res.error}. validPart=${res.validPart.map(fileName)} rest=[${res.rest}]`),
            )
        ),
        SRTE.sequenceArray,
        SRTE.map(RA.toArray),
      ),
    ),
  )
}
