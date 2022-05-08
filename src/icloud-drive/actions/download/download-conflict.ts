import * as E from 'fp-ts/Either'
import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as RT from 'fp-ts/lib/ReaderTask'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import * as O from 'fp-ts/Option'
import * as RA from 'fp-ts/ReadonlyArray'
import * as Task from 'fp-ts/Task'
import { DepFs } from '../../../deps-types'
import { FsStats } from '../../../util/fs'
import { isEnoentError } from '../../../util/fs/isEnoentError'
import { LocalTreeElement } from '../../../util/localtreeelement'
import { loggerIO } from '../../../util/loggerIO'
import { Path } from '../../../util/path'
import { EmptyObject, NEA } from '../../../util/types'
import { DownloadItem, DownloadItemMapped, DownloadTaskMapped } from './types'

// export type Conflict = readonly [
//   localitem: LocalTreeElement,
//   item: DownloadItemMapped,
// ]

export type Conflict = ConflictExists | ConflictStatsError

export type ConflictExists = {
  tag: 'exists'
  localitem: LocalTreeElement
  item: DownloadItemMapped
}

export type ConflictStatsError = {
  tag: 'statserror'
  item: DownloadItemMapped
  error: Error
}

export type SolutionAction = 'skip' | 'overwright'
export type Solution = (readonly [Conflict, SolutionAction])

export type ConflictsSolver<Deps = EmptyObject> = (
  conflicts: NEA<Conflict>,
) => RTE.ReaderTaskEither<Deps, Error, Solution[]>

export const lookForConflictsTE = (
  stats: (readonly [TE.TaskEither<Error, FsStats>, DownloadItemMapped])[],
): RT.ReaderTask<unknown, Conflict[]> =>
  pipe(
    stats,
    A.map(
      ([stat, item]) =>
        pipe(
          stat,
          TE.match(
            (error): E.Either<Conflict, DownloadItemMapped> =>
              isEnoentError(error)
                ? E.right(item)
                : E.left({ tag: 'statserror', item, error }),
            (stats): E.Either<Conflict, DownloadItemMapped> =>
              E.left(
                {
                  tag: 'exists',
                  item,
                  localitem: {
                    type: stats.isDirectory()
                      ? 'directory' as const
                      : 'file' as const,
                    stats,
                    path: item.localpath,
                    name: Path.basename(item.localpath),
                  },
                },
              ),
          ),
        ),
    ),
    Task.sequenceSeqArray,
    Task.map(RA.toArray),
    Task.map(A.separate),
    Task.map(({ left }) => left),
    RT.fromTask,
  )

export const lookForConflicts = (
  { downloadable, empties }: DownloadTaskMapped,
): RT.ReaderTask<DepFs<'fstat'>, Conflict[]> => {
  const remotes = pipe(
    [...downloadable, ...empties],
  )

  return RT.asksReaderTask(({ fs: { fstat } }) =>
    pipe(
      remotes,
      A.map((item) => fstat(item.localpath)),
      A.zip(remotes),
      lookForConflictsTE,
    )
  )
}

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
      remoteitem: DownloadItem
      localpath: string
    }) =>
      pipe(
        solutions,
        RA.findFirstMap(
          ([conflict, action]) =>
            conflict.item.remoteitem[1].drivewsid === d.remoteitem[1].drivewsid
              ? O.some([conflict.item, action] as const)
              : O.none,
        ),
        O.getOrElse(() => [d, 'overwright' as SolutionAction] as const),
      )

    const findAction = (fs: { remoteitem: DownloadItem; localpath: string }[]) =>
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

export const showConflict = (conflict: Conflict): string =>
  conflict.tag === 'exists'
    ? `local file ${conflict.item.localpath} (${conflict.localitem.stats.size} bytes) conflicts with remote file (${
      conflict.item.remoteitem[1].size
    } bytes)`
    : `error: ${conflict.error}`
