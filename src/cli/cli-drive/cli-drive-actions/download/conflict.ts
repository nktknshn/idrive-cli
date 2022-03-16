import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import { mapSnd } from 'fp-ts/lib/ReadonlyTuple'
import * as TE from 'fp-ts/lib/TaskEither'
import * as TR from 'fp-ts/lib/Tree'
import * as O from 'fp-ts/Option'
import { boolean } from 'yargs'
import { guardSnd, guardSndRO } from '../../../../icloud/drive/helpers'
import * as T from '../../../../icloud/drive/requests/types/types'
import { err } from '../../../../lib/errors'
import { loggerIO } from '../../../../lib/loggerIO'
import { Path } from '../../../../lib/util'
import {
  DownloadInfo,
  DownloadStructure,
  DownloadTask,
  FilterTreeResult,
  fstat,
  LocalTreeElement,
  walkDirRel,
} from './helpers'

export type Conflict = readonly [LocalTreeElement, { info: DownloadInfo; localpath: string }]

export type SolutionAction = 'skip' | 'overwright'
export type Solution = (readonly [Conflict, SolutionAction])[]

export type ConflictsSolver = (
  conflicts: Conflict[],
) => TE.TaskEither<Error, (readonly [Conflict, SolutionAction])[]>

const lookForConflicts = (
  localTree: TR.Tree<LocalTreeElement>,
  { downloadable, empties }: DownloadTask,
): Conflict[] => {
  const remotes = pipe(
    [...downloadable, ...empties],
  )

  const flat = pipe(
    localTree.forest,
    A.map(
      TR.reduce([] as LocalTreeElement[], (acc, cur) => [...acc, cur]),
    ),
    A.flatten,
  )
  // console.log(
  //   remotes.map(_ => _[0]),
  // )

  return pipe(
    flat,
    A.filter(_ => _.type === 'file'),
    flow(
      A.map(f =>
        [
          f,
          pipe(remotes, A.findFirst((p) => p.localpath === f.path)),
        ] as const
      ),
      A.filter(guardSndRO(O.isSome)),
      A.map(mapSnd(_ => _.value)),
    ),
  )
}

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
import * as E from 'fp-ts/Either'
import * as RA from 'fp-ts/ReadonlyArray'
import * as Task from 'fp-ts/Task'

const lookForConflicts2 = (
  { downloadable, empties }: DownloadTask,
) => {
  const remotes = pipe(
    [...downloadable, ...empties],
  )

  return pipe(
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
    // TE.ap
    // A.filter(_ => _.type === 'file'),
    // flow(
    //   A.map(f =>
    //     [
    //       f,
    //       pipe(remotes, A.findFirst((p) => p.localpath === f.path)),
    //     ] as const
    //   ),
    //   A.filter(guardSndRO(O.isSome)),
    //   A.map(mapSnd(_ => _.value)),
    // ),
  )
}

export const handleLocalFilesConflicts = ({ conflictsSolver }: {
  // dstpath: string
  conflictsSolver: ConflictsSolver
  // downloader: DownloadICloudFiles
}): (
  initialtask: DownloadTask,
) => TE.TaskEither<
  Error,
  DownloadTask & { initialTask: DownloadTask }
> =>
  (initialtask: DownloadTask) => {
    // const dst = Path.normalize(dstpath)

    // const conflicts = pipe(
    //   fstat(dst),
    //   TE.fold(
    //     (e) => TE.of([]),
    //     () =>
    //       pipe(
    //         walkDirRel(dst),
    //         TE.map(localtree => lookForConflicts(localtree, initialtask)),
    //       ),
    //   ),
    // )

    return pipe(
      lookForConflicts2(initialtask),
      TE.fromTask,
      TE.chain(conflictsSolver),
      TE.chainFirstIOK(
        (solution) =>
          loggerIO.debug(
            `conflicts: \n${
              solution.map(([conflict, action]) => `[${action}] ${showConflict(conflict)}`).join('\n')
            }\n`,
          ),
      ),
      TE.map(applySoultion(initialtask)),
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

export const solvers = {
  failOnConflicts,
  resolveConflictsSkipAll,
  resolveConflictsOverwrightAll,
  resolveConflictsRename,
  resolveConflictsOverwrightIfSizeDifferent,
}
