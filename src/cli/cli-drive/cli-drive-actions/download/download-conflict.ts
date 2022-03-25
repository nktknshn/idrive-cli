import * as E from 'fp-ts/Either'
import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import * as RT from 'fp-ts/lib/ReaderTask'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { mapSnd } from 'fp-ts/lib/ReadonlyTuple'
import * as TE from 'fp-ts/lib/TaskEither'
import * as TR from 'fp-ts/lib/Tree'
import * as O from 'fp-ts/Option'
import * as RA from 'fp-ts/ReadonlyArray'
import * as Task from 'fp-ts/Task'
import { DepFs } from '../../../../icloud/drive/deps'
import * as T from '../../../../icloud/drive/types'
import { err } from '../../../../lib/errors'
import { loggerIO } from '../../../../lib/loggerIO'
import { guardSndRO, Path } from '../../../../lib/util'
import { DownloadInfo, DownloadTask } from './types'
import { LocalTreeElement } from './walkdir'

export type Conflict = readonly [LocalTreeElement, { info: DownloadInfo; localpath: string }]

export type SolutionAction = 'skip' | 'overwright'
export type Solution = (readonly [Conflict, SolutionAction])[]

export type ConflictsSolver = (
  conflicts: Conflict[],
) => TE.TaskEither<Error, (readonly [Conflict, SolutionAction])[]>

export const showConflict = ([localfile, { info, localpath }]: Conflict) =>
  `local file ${localpath} (${localfile.stats.size} bytes) conflicts with remote file (${info[1].size} bytes)`

const applySoultion = (
  { downloadable, empties, localdirstruct }: DownloadTask,
) =>
  (
    solution: Solution,
  ): DownloadTask & {
    initialTask: DownloadTask
  } => {
    const fa = (d: {
      info: DownloadInfo
      localpath: string
    }) =>
      pipe(
        solution,
        A.findFirstMap(
          ([[localfile, { info, localpath }], action]) =>
            info[1].drivewsid === d.info[1].drivewsid ? O.some([{ info, localpath }, action] as const) : O.none,
        ),
        O.getOrElse(() => [d, 'overwright' as SolutionAction] as const),
      )

    const findAction = (fs: { info: DownloadInfo; localpath: string }[]) =>
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

const lookForConflicts = (
  { downloadable, empties }: DownloadTask,
): RT.ReaderTask<DepFs<'fstat'>, Conflict[]> => {
  const remotes = pipe(
    [...downloadable, ...empties],
  )

  return RT.asksReaderTask(({ fs: { fstat } }) =>
    pipe(
      remotes,
      A.map(
        (c) =>
          pipe(
            fstat(c.localpath),
            TE.match((e) => E.right(c), s => E.left({ c, s })),
          ),
        //
      ),
      Task.sequenceSeqArray,
      Task.map(RA.toArray),
      Task.map(A.separate),
      Task.map(({ left }) =>
        pipe(
          left,
          A.map(({ c, s }): Conflict => [{
            type: s.isDirectory() ? 'directory' as const : 'file' as const,
            stats: s,
            path: c.localpath,
            name: Path.basename(c.localpath),
          }, c]),
        )
      ),
      RT.fromTask,
    )
  )
}

export const handleLocalFilesConflicts = ({ conflictsSolver }: {
  // dstpath: string
  conflictsSolver: ConflictsSolver
  // downloader: DownloadICloudFiles
}): (
  initialtask: DownloadTask,
) => RTE.ReaderTaskEither<
  DepFs<'fstat'>,
  Error,
  DownloadTask & { initialTask: DownloadTask }
> =>
  (initialtask: DownloadTask) => {
    return pipe(
      RTE.fromReaderTaskK(lookForConflicts)(initialtask),
      RTE.chainW(flow(conflictsSolver, RTE.fromTaskEither)),
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

const failOnConflicts: ConflictsSolver = (conflicts) =>
  pipe(
    conflicts,
    A.match(
      () => TE.of([]),
      () => TE.left(err(`conflicts`)),
    ),
  )
const resolveConflictsSkipAll: ConflictsSolver = (conflicts) =>
  pipe(
    conflicts,
    A.map(c => [c, 'skip'] as const),
    TE.of,
  )
const resolveConflictsOverwrightAll: ConflictsSolver = (conflicts) =>
  pipe(
    conflicts,
    A.map(c => [c, 'overwright'] as const),
    TE.of,
  )
const resolveConflictsRename: ConflictsSolver = (conflicts) =>
  pipe(
    conflicts,
    A.map(([localfile, { info, localpath }]) =>
      [[localfile, { info, localpath: localpath + '.new' }], 'overwright'] as const
    ),
    TE.of,
  )

const resolveConflictsOverwrightIfSizeDifferent = (
  skipRemotes = (f: T.DriveChildrenItemFile) => false,
): ConflictsSolver =>
  (conflicts) =>
    pipe(
      conflicts,
      A.map(([localfile, { info, localpath }]) =>
        localfile.stats.size !== info[1].size && !skipRemotes(info[1])
          ? [[localfile, { info, localpath }], 'overwright' as SolutionAction] as const
          : [[localfile, { info, localpath }], 'skip' as SolutionAction] as const
      ),
      TE.of,
    )

const resolveConflictsAsk: ConflictsSolver = (conflicts) =>
  pipe(
    conflicts,
    A.map(([localfile, { info, localpath }]) =>
      [[localfile, { info, localpath: localpath + '.new' }], 'overwright'] as const
    ),
    TE.of,
  )

export const solvers = {
  failOnConflicts,
  resolveConflictsSkipAll,
  resolveConflictsOverwrightAll,
  resolveConflictsRename,
  resolveConflictsOverwrightIfSizeDifferent,
  resolveConflictsAsk,
}