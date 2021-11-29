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

type DetailsOrFile = (DriveDetails | DriveChildrenItemFile)

type ValidatedHierarchy = {
  validPart: DetailsOrFile[]
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
  hierarchies: Hierarchy[],
): DF.DriveM<ValidatedHierarchy[]> => {
  const drivewsids = pipe(
    hierarchies,
    A.flatten,
    A.uniq(equalsDrivewsId),
    A.map(_ => _.drivewsid),
    A.filter(isFolderDrivewsid),
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

/* export const validateHierarchiesItem = (
  hierarchies: Hierarchy[],
): DF.DriveM<ValidatedHierarchy[]> => {
  const drivewsids = pipe(
    hierarchies,
    A.flatten,
    A.uniq(equalsDrivewsId),
    A.map(_ => _.drivewsid),
    A.filter(isFolderDrivewsid),
  )

  return pipe(
    logg(`validateHierarchiesItem: [${hierarchies.map(showHierarchiy)}]`),
    () =>
      drivewsids.length > 0
        ? DF.retrieveItemDetailsInFoldersSaving(drivewsids)
        : DF.of([]),
    SRTE.map(ds => A.zip(drivewsids, ds)),
    SRTE.map(recordFromTuples),
    SRTE.map(result =>
      pipe(
        hierarchies,
        A.map(hierarchy =>
          pipe(
            toActual(hierarchy, result),
            actualDetails => DF.getValidHierarchyPart(actualDetails, hierarchy),
          )
        ),
      )
    ),
    SRTE.map(logReturnS(res => res.map(showResult).join(', '))),
  )
} */

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

  // return pipe(
  //   validPart,
  //   A.matchRight(
  //     () => DF.getActual(path),
  //     (_, last) => DF.getActualRelative(rest, last),
  //   ),
  // )
}

export const validateCachedPaths = (
  paths: NormalizedPath[],
): DF.DriveM<ValidatedHierarchy[]> => {
  return pipe(
    logg(`validateCachedPaths: ${paths}`),
    () => DF.readEnv,
    SRTE.bind('cached', ({ cache }) => SRTE.of(paths.map(cache.getByPathV2))),
    SRTE.chain(({ cached }) =>
      pipe(
        cached,
        logReturnS(c => `getByPathV: ${c.map(showPartialValid)}`),
        A.map(c => C.entitiesToHierarchy(c.validPart)),
        validateHierarchies,
        SRTE.map(A.zip(cached)),
        SRTE.map(A.map(([v, c]) =>
          c.rest.length == 0
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

type MaybePartial = E.Either<
  {
    validPath: NA.NonEmptyArray<DriveDetails>
    rest: string[]
  },
  DetailsOrFile
>

interface Path {
  root: DriveDetailsRoot
}

type HasRest = ({
  validPart: []
  rest: NA.NonEmptyArray<string>
})

type HasBoth = {
  validPart: NA.NonEmptyArray<DriveDetails>
  rest: NA.NonEmptyArray<string>
}

type HasValid = {
  validPart: NA.NonEmptyArray<DetailsOrFile>
  rest: []
}

type Has = HasRest | HasValid | HasBoth

const hasRest = (partial: {
  validPart: DetailsOrFile[]
  rest: string[]
}): partial is HasRest => partial.rest.length > 0 && partial.validPart.length == 0

const hasBoth = (partial: {
  validPart: DetailsOrFile[]
  rest: string[]
}): partial is HasBoth => partial.rest.length > 0 && partial.validPart.length > 0

const hasValid = (partial: {
  validPart: DetailsOrFile[]
  rest: string[]
}): partial is HasValid => partial.rest.length == 0 && partial.validPart.length > 0

// try to find the rest, returning rest if it's not found
/*
*/
// C.getPartialValidPath

// type PartialPath = C.PartialValidPath<DetailsOrFile, DriveDetails>

const getByPathV = (path: string, cache: Cache): Has => {
  const res = cache.getByPathV(path)

  if (res.valid) {
    return {
      rest: [],
      validPart: pipe(res.entities, NA.map(_ => _.content)),
    }
  }
}

type PartialPathValid = {
  readonly status: 'valid'
  entities: NA.NonEmptyArray<DetailsOrFile>
}

type PartialPathInvalid = {
  readonly status: 'invalid'
  validPart: DriveDetails[]
  rest: NA.NonEmptyArray<string>
  error: Error
}

type PartialPathIncomplete = {
  readonly status: 'incomplete'
  validPart: DriveDetails[]
  rest: NA.NonEmptyArray<string>
}

type PartialPath =
  | PartialPathValid
  | PartialPathInvalid
  | PartialPathIncomplete

type TaskE = E.Either<
  PartialPathInvalid | PartialPathValid | PartialPathIncomplete,
  {
    incompletee: PartialPathIncomplete
    subfolder: DriveChildrenItemFolder | DriveChildrenItemAppLibrary
  }
>

const initPartials = (partials: PartialPath[]): DF.DriveM<PartialPath[]> => {
}

/*
const actualizePartials = (partials: PartialPath[]): DF.DriveM<PartialPath[]> => {
  return pipe(
    partials,
    A.filter((p): p is PartialPathIncomplete => p.status === 'incomplete'),
    incompletes => {
      const task = pipe(
        A.zip(
          incompletes,
          incompletes.map(_ =>
            pipe(
              _.validPart,
              A.matchRight(
                () =>
              ),
            )
          ),
        ),
        A.map(([inc, last]) => {
          const [lookingName, rest] = [NA.head(inc.rest), NA.tail(inc.rest)]

          const itemOpt = pipe(
            last.items,
            A.findFirst(item => fileName(item) == lookingName),
          )

          return pipe(
            itemOpt,
            O.fold(
              (): TaskE =>
                E.left(
                  {
                    validPart: inc.validPart,
                    status: 'invalid',
                    error: NotFoundError.create(`item ${lookingName} was not found`),
                    rest: inc.rest,
                  },
                ),
              (item): TaskE => {
                if (item.type === 'FILE') {
                  if (rest.length == 0) {
                    return E.left(
                      {
                        status: 'valid',
                        entities: NA.concat(
                          inc.validPart as NA.NonEmptyArray<DetailsOrFile>,
                          NA.of(item),
                        ),
                      },
                    )
                  }
                  else {
                    return E.left({
                      status: 'invalid',
                      error: ItemIsNotFolder.create(`${lookingName} is not folder`),
                      rest: inc.rest,
                      validPart: inc.validPart,
                    })
                  }
                }
                else {
                  return E.right({
                    incompletee: inc,
                    subfolder: item,
                  })
                }
              },
            ),
          )
        }),
      )

      const right = pipe(
        task,
        A.filterMapWithIndex(flow((index, item) =>
          pipe(
            O.fromPredicate(E.isRight)(item),
            O.map(item => ({
              index,
              item: item.right,
            })),
          )
        )),
      )

      if (right.length == 0) {
        return DF.of(partials)
      }

      const completeTask = pipe(
        right,
        A.map(_ => _.item.subfolder.drivewsid),
        DF.retrieveItemDetailsInFoldersSaving,
        SRTE.map(A.zip(right)),
        SRTE.map(A.map(([details, rightItem]) =>
          pipe(
            details,
            O.fold(
              (): PartialPath => ({
                status: 'invalid',
                error: NotFoundError.create(`${rightItem.item.subfolder.drivewsid} was not found`),
                rest: rightItem.item.incompletee.rest,
                validPart: rightItem.item.incompletee.validPart,
              }),
              (details): PartialPath =>
                pipe(
                  pipe(rightItem.item.incompletee.rest, A.dropLeft(1)),
                  A.matchW(
                    (): PartialPath => ({
                      status: 'valid',
                      entities: NA.concat(
                        rightItem.item.incompletee.validPart,
                        NA.of(details),
                      ),
                    }),
                    (rest) => ({
                      rest,
                      status: 'incomplete',
                      validPart: NA.concat(
                        rightItem.item.incompletee.validPart,
                        NA.of(details),
                      ),
                    }),
                  ),
                ),
            ),
            item => ({
              index: rightItem.index,
              item: E.left(item),
            }),
          )
        )),
        // SRTE.map((v): TaskE => E.right(v)),
      )

      const result: DF.DriveM<PartialPath[]> = pipe(
        completeTask,
        SRTE.map(completeTask =>
          pipe(
            projectIndexes(task, completeTask),
            A.separate,
            _ => _.left,
          )
        ),
      )

      return pipe(result, DF.chain(actualizePartials))
    },
  )
} */

const procesPartialValidPaths = (
  partials: C.PartialValidPath<CacheEntity, CacheEntityFolderLike>[],
) => {
  pipe(
    partials,
    A.map(_ => C.entitiesToHierarchy(_.valid ? _.entities : _.validPart)),
    validateHierarchies,
  )
}

// export const getByPathsMaybe = (
//   paths: NormalizedPath[],
// ): DF.DriveM<PartialPath[]> => {
//   const res = pipe(
//     DF.readEnv,
//     // first get cached parts of the paths
//     SRTE.bind('cached', ({ cache }) => SRTE.of(paths.map(cache.getByPathV))),
//     SRTE.chain(({ cached }) => {

//     }),
//   )
// }
/*
taken paths
*/

export const getByPathsMaybe = (
  paths: NormalizedPath[],
): DF.DriveM<PartialPath[]> => {
  return pipe(
    DF.readEnv,
    // first get cached parts of the paths
    SRTE.bind('cached', ({ cache }) => SRTE.of(paths.map(cache.getByPathV2))),
    SRTE.chain(({ cached }) =>
      pipe(
        cached,
        A.map(c => C.entitiesToHierarchy(c.validPart)),
        validateHierarchies,
        SRTE.map(A.zip(cached)),
        SRTE.map(
          A.map(
            ([{ validPart, rest: actualRest }, { rest }]) => ({
              validPart,
              rest: [...actualRest, ...rest],
            }),
          ),
        ),
        SRTE.map(logReturnAs('dsaf')),
        // nextly we need to try to retrieve the rest relative to the validParts without failing to NotFoundError
        SRTE.chain(
          (partials: Has[]) =>
            actualizePartials(pipe(
              partials,
              A.map((partial): PartialPath => {
                if (hasRest(partial)) {
                  return {
                    status: 'incomplete',
                    rest: partial.rest,
                    validPart: partial.validPart,
                  }
                }
                else if (A.isNonEmpty(partial.validPart)) {
                  return {
                    status: 'valid',
                    entities: partial.validPart,
                  }
                }
                else {
                  return {
                    status: 'invalid',
                    error: err(`da blya`),
                    rest: partial.rest,
                    validPart: [],
                  }
                }
              }),
            )),
        ),
      )
    ),
  )
}

export const getByPaths = (
  paths: NormalizedPath[],
): DF.DriveM<DetailsOrFile[]> => {
  const res = pipe(
    logg(`getByPath. ${paths}`),
    () => validateCachedPaths(paths),
    SRTE.map(A.zip(paths)),
    SRTE.map(A.map(([{ rest, validPart }, path]) => getPath(path, validPart, rest))),
    SRTE.chain(SRTE.sequenceArray),
    SRTE.map(RA.toArray),
  )

  return res
}

export const lss = (paths: NormalizedPath[]): DF.DriveM<DetailsOrFile[]> => {
  return getByPaths(paths)
}

export const lssMaybe = (paths: NormalizedPath[]): DF.DriveM<DetailsOrFile[]> => {
  return pipe(
    getByPathsMaybe(paths),
    SRTE.map(A.filter(
      (_): _ is PartialPathValid => _.status === 'valid',
    )),
    SRTE.map(A.map(_ => NA.last(_.entities))),
  )
}
