import * as E from 'fp-ts/Either'
import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as RT from 'fp-ts/lib/ReaderTask'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as O from 'fp-ts/Option'
import * as RA from 'fp-ts/ReadonlyArray'
import * as Task from 'fp-ts/Task'
import { DepAskConfirmation } from '../../../../../deps/DepAskConfirmation'
import { DepFs } from '../../../../../deps/DepFs'
import { T } from '../../../../../icloud/drive'
import { err } from '../../../../../util/errors'
import { LocalTreeElement } from '../../../../../util/localtreeelement'
import { loggerIO } from '../../../../../util/loggerIO'
import { Path } from '../../../../../util/path'
import { EmptyObject, NEA, UnknownObject } from '../../../../../util/types'
import { DownloadItem, DownloadItemMapped, DownloadTaskLocalMapping } from './types'

export type Conflict = readonly [localitem: LocalTreeElement, task: DownloadItemMapped]

export type SolutionAction = 'skip' | 'overwright'
export type Solution = readonly (readonly [Conflict, SolutionAction])[]

export type ConflictsSolver<Deps = UnknownObject> = (
  conflicts: NEA<Conflict>,
) => RTE.ReaderTaskEither<Deps, Error, Solution>

export const showConflict = ([localfile, { info, localpath }]: Conflict) =>
  `local file ${localpath} (${localfile.stats.size} bytes) conflicts with remote file (${info[1].size} bytes)`

const lookForConflicts = (
  { downloadable, empties }: DownloadTaskLocalMapping,
): RT.ReaderTask<DepFs<'fstat'>, Conflict[]> => {
  const remotes = pipe(
    [...downloadable, ...empties],
  )

  return RT.asksReaderTask(({ fs: { fstat } }) =>
    pipe(
      remotes,
      A.map(
        (task) =>
          pipe(
            fstat(task.localpath),
            TE.match((e) => E.right(task), s => E.left({ task, s })),
          ),
        //
      ),
      Task.sequenceSeqArray,
      Task.map(RA.toArray),
      Task.map(A.separate),
      Task.map(({ left }) =>
        pipe(
          left,
          A.map(({ task, s }): Conflict => [{
            type: s.isDirectory() ? 'directory' as const : 'file' as const,
            stats: s,
            path: task.localpath,
            name: Path.basename(task.localpath),
          }, task]),
        )
      ),
      RT.fromTask,
    )
  )
}

export const handleLocalFilesConflicts = <SolverDeps = UnknownObject>(
  { conflictsSolver }: {
    conflictsSolver: ConflictsSolver<SolverDeps>
  },
): (
  initialtask: DownloadTaskLocalMapping,
) => RTE.ReaderTaskEither<
  DepFs<'fstat'> & SolverDeps,
  Error,
  DownloadTaskLocalMapping & { initialTask: DownloadTaskLocalMapping }
> =>
  (initialtask: DownloadTaskLocalMapping) => {
    return pipe(
      initialtask,
      RTE.fromReaderTaskK(lookForConflicts),
      RTE.chainW(A.matchW(() => RTE.of([]), conflictsSolver)),
      RTE.chainFirstIOK(
        (solution) =>
          loggerIO.debug(
            `conflicts: \n${
              solution.map(([conflict, action]) => `[${action}] ${showConflict(conflict)}`).join('\n')
            }\n`,
          ),
      ),
      RTE.map(applySoultion(initialtask)),
    )
  }

const applySoultion = (
  { downloadable, empties, localdirstruct }: DownloadTaskLocalMapping,
) =>
  (
    solution: Solution,
  ): DownloadTaskLocalMapping & {
    initialTask: DownloadTaskLocalMapping
  } => {
    const fa = (d: {
      info: DownloadItem
      localpath: string
    }) =>
      pipe(
        solution,
        RA.findFirstMap(
          ([[localfile, { info, localpath }], action]) =>
            info[1].drivewsid === d.info[1].drivewsid ? O.some([{ info, localpath }, action] as const) : O.none,
        ),
        O.getOrElse(() => [d, 'overwright' as SolutionAction] as const),
      )

    const findAction = (fs: { info: DownloadItem; localpath: string }[]) =>
      pipe(
        fs,
        A.map((c) => fa(c)),
        A.filterMap(([d, action]) => action === 'overwright' ? O.some(d) : O.none),
      )

    return {
      downloadable: findAction(downloadable),
      empties: findAction(empties),
      localdirstruct,
      initialTask: { downloadable, empties, localdirstruct },
    }
  }

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
      A.map(([localfile, { info, localpath }]) =>
        [[localfile, { info, localpath: localpath + '.new' }], 'overwright'] as const
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
        A.map(([localfile, { info, localpath }]) =>
          localfile.stats.size !== info[1].size && !skipRemotes(info[1])
            ? [[localfile, { info, localpath }], 'overwright' as SolutionAction] as const
            : [[localfile, { info, localpath }], 'skip' as SolutionAction] as const
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
            A.map(([a, b]) => a.path),
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
        A.map(([local, remote]) => askConfirmation({ message: `overwright ${local.path}` })),
        TE.sequenceSeqArray,
      )
    ),
    RTE.map(RA.zip(conflicts)),
    RTE.map(RA.map(
      ([ov, conflict]) =>
        ov
          ? [conflict, 'overwright']
          : [conflict, 'skip'],
    )),
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
