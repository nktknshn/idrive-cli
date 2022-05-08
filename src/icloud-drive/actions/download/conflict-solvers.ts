import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as RA from 'fp-ts/ReadonlyArray'
import { DepAskConfirmation } from '../../../deps-types'
import { err } from '../../../util/errors'
import { T } from '../..'
import { ConflictExists, ConflictsSolver, SolutionAction } from './download-conflict'

const failOnConflicts: ConflictsSolver = (conflicts) =>
  () =>
    pipe(
      conflicts,
      A.match(
        () => TE.of([]),
        () => TE.left(err(`conflicts`)),
      ),
    )
const resolveConflictsSkipAll: ConflictsSolver = (conflicts) =>
  () =>
    pipe(
      conflicts,
      A.map(c => [c, 'skip'] as const),
      TE.of,
    )
const resolveConflictsOverwrightAll: ConflictsSolver = (conflicts) =>
  () =>
    pipe(
      conflicts,
      A.map(c => [c, 'overwright'] as const),
      TE.of,
    )

const resolveConflictsRename: ConflictsSolver = (conflicts) =>
  () =>
    pipe(
      conflicts,
      A.map((conflict) =>
        conflict.tag === 'exists'
          ? [
            {
              ...conflict,
              item: { ...conflict.item, localpath: conflict.item.localpath + '.new' },
            },
            'overwright',
          ] as const
          : [
            conflict,
            'skip',
          ] as const
      ),
      TE.of,
    )

// eslint-disable-next-line id-length
const resolveConflictsOverwrightIfSizeDifferent = (
  skipRemotes = (f: T.DriveChildrenItemFile) => false,
): ConflictsSolver =>
  (conflicts) =>
    () =>
      pipe(
        conflicts,
        A.map((conflict) =>
          conflict.tag === 'exists'
            ? conflict.localitem.stats.size !== conflict.item.info[1].size && !skipRemotes(conflict.item.info[1])
              ? [conflict, 'overwright' as SolutionAction] as const
              : [conflict, 'skip' as SolutionAction] as const
            : [
              conflict,
              'skip',
            ] as const
        ),
        TE.of,
      )

const resolveConflictsAskAll: ConflictsSolver<DepAskConfirmation> = (conflicts) => {
  return pipe(
    RTE.ask<DepAskConfirmation>(),
    RTE.chainTaskEitherK(({ askConfirmation }) =>
      askConfirmation({
        message: `overwright?\n${
          pipe(
            conflicts,
            A.filter((_): _ is ConflictExists => _.tag === 'exists'),
            A.map((conflict) => conflict.localitem.path),
            _ => _.join('\n'),
          )
        }`,
      })
    ),
    RTE.chainW(a => a ? resolveConflictsOverwrightAll(conflicts) : failOnConflicts(conflicts)),
  )
}
const resolveConflictsAskEvery: ConflictsSolver<DepAskConfirmation> = (conflicts) => {
  return pipe(
    RTE.ask<DepAskConfirmation>(),
    RTE.chainTaskEitherK(({ askConfirmation }) =>
      pipe(
        conflicts,
        A.filter((_): _ is ConflictExists => _.tag === 'exists'),
        A.map((conflict) => askConfirmation({ message: `overwright ${conflict.localitem.path}` })),
        TE.sequenceSeqArray,
      )
    ),
    RTE.map(RA.zip(conflicts)),
    RTE.map(RA.map(
      ([ov, conflict]) =>
        ov
          ? [conflict, 'overwright'] as const
          : [conflict, 'skip'] as const,
    )),
    RTE.map(RA.toArray),
  )
}

export const solvers = {
  failOnConflicts,
  resolveConflictsSkipAll,
  resolveConflictsOverwrightAll,
  resolveConflictsRename,
  // eslint-disable-next-line id-length
  resolveConflictsOverwrightIfSizeDifferent,
  resolveConflictsAskAll,
  resolveConflictsAskEvery,
}