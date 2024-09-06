import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as O from 'fp-ts/Option'
import * as RA from 'fp-ts/ReadonlyArray'
import { DepFs } from '../../../deps-types'
import { loggerIO } from '../../../logging/loggerIO'
import { EmptyObject, NEA } from '../../../util/types'
import { Conflict, lookForLocalConflicts, showConflict } from './download-conflict'
import { DownloadItem, DownloadTaskMapped } from './types'

export type SolutionAction = 'skip' | 'overwright'
export type Solution = (readonly [Conflict, SolutionAction])

export type ConflictsSolver<Deps = EmptyObject> = (
  conflicts: NEA<Conflict>,
) => RTE.ReaderTaskEither<Deps, Error, Solution[]>

export const handleLocalFilesConflicts = <SolverDeps = EmptyObject>(
  { conflictsSolver }: {
    conflictsSolver: ConflictsSolver<SolverDeps>
  },
): (
  initialtask: DownloadTaskMapped,
) => RTE.ReaderTaskEither<
  DepFs<'fstat'> & SolverDeps,
  Error,
  DownloadTaskMapped & { initialTask: DownloadTaskMapped }
> =>
  (initialtask: DownloadTaskMapped) => {
    return pipe(
      initialtask,
      RTE.fromReaderTaskK(lookForLocalConflicts),
      RTE.chainW(A.matchW(() => RTE.of([]), conflictsSolver)),
      RTE.chainFirstIOK(
        (solution) =>
          loggerIO.debug(
            `conflicts: \n${
              solution.map(([conflict, action]) => `[${action}] ${showConflict(conflict)}`).join('\n')
            }\n`,
          ),
      ),
      RTE.map(applySoultions(initialtask)),
    )
  }

export const applySoultions = (
  { downloadable, empties, localdirstruct }: DownloadTaskMapped,
) =>
  (solutions: Solution[]): DownloadTaskMapped & {
    initialTask: DownloadTaskMapped
  } => {
    const fa = (d: {
      item: DownloadItem
      localpath: string
    }) =>
      pipe(
        solutions,
        RA.findFirstMap(
          ([conflict, action]) =>
            conflict.item.item.item.drivewsid === d.item.item.drivewsid
              ? O.some([conflict.item, action] as const)
              : O.none,
        ),
        O.getOrElse(() => [d, 'overwright' as SolutionAction] as const),
      )

    const findAction = (fs: { item: DownloadItem; localpath: string }[]) =>
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
