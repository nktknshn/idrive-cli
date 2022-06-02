/* eslint-disable @typescript-eslint/no-unused-vars */
import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as O from 'fp-ts/Option'
import * as RA from 'fp-ts/ReadonlyArray'
import { DepAskConfirmation } from '../../../deps-types'
import { err } from '../../../util/errors'
import { EmptyObject, NEA } from '../../../util/types'
import { T } from '../..'
import { ConflictsSolver, SolutionAction } from './conflict-solution'
import { Conflict, ConflictExists } from './download-conflict'
import { DownloadTaskMapped } from './types'

export type ConflictsSolver2<TDeps = EmptyObject, TAddInfo = EmptyObject> = (
  data: {
    conflicts: NEA<Conflict>
    mappedTask: DownloadTaskMapped
  },
) => RTE.ReaderTaskEither<
  TDeps,
  Error,
  ConflictData & TAddInfo
>

type ConflictData = {
  conflicts: Conflict[]
  mappedTask: DownloadTaskMapped
}

const onStatsError = <D, A>(
  solver: ConflictsSolver2<D, A>,
): ConflictsSolver2<D> | ConflictsSolver2<D, A> =>
  (conflictsData) =>
    pipe(
      conflictsData.conflicts,
      A.filter(
        _ => _.tag === 'statserror',
      ),
      A.matchW(
        () => RTE.right(conflictsData),
        (errors) => solver(conflictsData),
      ),
    )

// const resolveConflictsRenameOrMove: ({ renameFunction }: {
//   renameFunction: (c: ConflictExists, d: ConflictData) => O.Option<string>
// }) => ConflictsSolver2 = ({ renameFunction }) =>
//   (conflictsData) =>
//     () => {
//       pipe(
//         conflictsData.conflicts,
//         A.map((conflict) => conflict.tag === 'exists' ? 1 : 0),
//         TE.of,
//       )
//     }

// const resolveConflictsAskAll: ConflictsSolver2<DepAskConfirmation> = (conflictsData) => {
//   return pipe(
//     RTE.Do,
//     RTE.bind('deps', () => RTE.ask<DepAskConfirmation>()),
//     RTE.bind('conflicts', () =>
//       RTE.of(
//         pipe(
//           conflictsData.conflicts,
//           A.filter((_): _ is ConflictExists => _.tag === 'exists'),
//           // A.map((conflict) => conflict.localitem.path),
//           // _ => _.join('\n'),
//         ),
//       )),
//     RTE.chainTaskEitherK(({ deps, conflicts }) =>
//       deps.askConfirmation({
//         message: `overwright?\n${
//           pipe(
//             conflicts,
//             A.map((conflict) => conflict.localitem.path),
//             _ => _.join('\n'),
//           )
//         }`,
//       })
//     ),
//     RTE.chainW(a =>
//       a
//         ? resolveConflictsOverwrightAll(conflicts)
//         : RTE.left(err(`sa`))
//     ),
//   )
// }
