import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import { mapSnd } from 'fp-ts/lib/ReadonlyTuple'
import * as TE from 'fp-ts/lib/TaskEither'
import * as TR from 'fp-ts/lib/Tree'
import * as O from 'fp-ts/Option'
import { boolean } from 'yargs'
import { guardSnd } from '../../../../icloud/drive/helpers'
import * as T from '../../../../icloud/drive/requests/types/types'
import { err } from '../../../../lib/errors'
import { loggerIO } from '../../../../lib/loggerIO'
import { Path } from '../../../../lib/util'
import { DownloadInto, DownloadTask, FilterTreeResult, fstat, LocalTreeElement, walkDirRel } from './helpers'

export type Conflict = readonly [LocalTreeElement, readonly [localpath: string, remotefile: T.DriveChildrenItemFile]]

export const lookForConflicts = (
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
          pipe(remotes, A.findFirst(([p]) => p === f.path)),
        ] as const
      ),
      A.filter(guardSnd(O.isSome)),
      A.map(mapSnd(_ => _.value)),
    ),
  )
}

export const showConflict = ([localfile, [localpath, file]]: Conflict) =>
  `local file ${localpath} (${localfile.stats.size} bytes) conflicts with remote file (${file.size} bytes)`

export type SolutionAction = 'skip' | 'overwright'
export type Solution = (readonly [Conflict, SolutionAction])[]

export type ConflictsSolver = (
  conflicts: Conflict[],
) => TE.TaskEither<Error, (readonly [Conflict, SolutionAction])[]>

export const applySoultion = (
  { downloadable, empties, dirstruct }: DownloadTask,
) =>
  (
    solution: Solution,
  ): { dirstruct: string[]; downloadable: DownloadInto[]; empties: DownloadInto[] } & { initialTask: DownloadTask } => {
    const fa = ([path, file]: readonly [string, T.DriveChildrenItemFile]) =>
      pipe(
        solution,
        A.findFirstMap(
          ([[localfile, [localpath, f]], action]) =>
            f.drivewsid === file.drivewsid ? O.some([localpath, file, action] as const) : O.none,
        ),
        O.getOrElse(() => [path, file, 'overwright' as SolutionAction] as const),
      )

    const findAction = (fs: DownloadInto[]) =>
      pipe(
        fs,
        A.map((c) => fa(c)),
        A.filterMap(([path, file, action]) => action === 'overwright' ? O.some([path, file] as const) : O.none),
      )

    return {
      downloadable: findAction(downloadable),
      empties: findAction(empties),
      dirstruct,
      initialTask: { downloadable, empties, dirstruct },
    }
  }

export const handleLocalFilesConflicts = ({ dstpath, conflictsSolver }: {
  dstpath: string
  conflictsSolver: ConflictsSolver
  // downloader: DownloadICloudFiles
}): (
  initialtask: DownloadTask,
) => TE.TaskEither<
  Error,
  { dirstruct: string[]; downloadable: DownloadInto[]; empties: DownloadInto[]; initialTask: DownloadTask }
> =>
  (initialtask: DownloadTask) => {
    const dst = Path.normalize(dstpath)

    const conflicts = pipe(
      fstat(dst),
      TE.fold(
        (e) => TE.of([]),
        () =>
          pipe(
            walkDirRel(dst),
            TE.map(localtree => lookForConflicts(localtree, initialtask)),
          ),
      ),
    )

    return pipe(
      conflicts,
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
    A.map(([localfile, [path, remotefile]]) => [[localfile, [path + '.new', remotefile]], 'overwright'] as const),
    TE.of,
  )

const resolveConflictsOverwrightIfSizeDifferent = (
  skipRemotes = (f: T.DriveChildrenItemFile) => false,
): ConflictsSolver =>
  (conflicts) =>
    pipe(
      conflicts,
      A.map(([localfile, [path, remotefile]]) =>
        localfile.stats.size !== remotefile.size && !skipRemotes(remotefile)
          ? [[localfile, [path, remotefile]], 'overwright' as SolutionAction] as const
          : [[localfile, [path, remotefile]], 'skip' as SolutionAction] as const
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
