import * as A from 'fp-ts/lib/Array'
import { flow, pipe } from 'fp-ts/lib/function'
import { mapSnd } from 'fp-ts/lib/ReadonlyTuple'
import * as TE from 'fp-ts/lib/TaskEither'
import * as TR from 'fp-ts/lib/Tree'
import * as O from 'fp-ts/Option'
import { guardSnd } from '../../../../icloud/drive/helpers'
import * as T from '../../../../icloud/drive/requests/types/types'
import { err } from '../../../../lib/errors'
import { DownloadInto, FilterTreeResult, LocalTreeElement } from './helpers'

export type Conflict = readonly [LocalTreeElement, readonly [localpath: string, remotefile: T.DriveChildrenItemFile]]

export const lookForConflicts = (
  localTree: TR.Tree<LocalTreeElement>,
  { downloadable, empties }: FilterTreeResult,
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
  `conflict: local file ${localpath} (${localfile.stats.size} bytes) conflicts with remote file (${file.size} bytes)`

export type SolutionAction = 'skip' | 'overwright'
export type Solution = (readonly [Conflict, SolutionAction])[]

export type ConflictsSolver = (
  conflicts: Conflict[],
) => TE.TaskEither<Error, (readonly [Conflict, SolutionAction])[]>

export const failOnConflicts: ConflictsSolver = (conflicts) =>
  pipe(
    conflicts,
    A.match(
      () => TE.of([]),
      () => TE.left(err(`conflicts`)),
    ),
  )
export const resolveConflictsSkipAll: ConflictsSolver = (conflicts) =>
  pipe(
    conflicts,
    A.map(c => [c, 'skip'] as const),
    TE.of,
  )
export const resolveConflictsOverwrightAll: ConflictsSolver = (conflicts) =>
  pipe(
    conflicts,
    A.map(c => [c, 'overwright'] as const),
    TE.of,
  )

export const applySoultion = (
  { downloadable, empties }: FilterTreeResult,
) =>
  (solution: Solution): { downloadable: DownloadInto[]; empties: DownloadInto[] } => {
    const fa = (path: string) =>
      pipe(
        solution,
        A.findFirstMap(
          ([[localfile, [localpath, file]], action]) => localpath === path ? O.some(action) : O.none,
        ),
        O.getOrElse((): SolutionAction => 'overwright'),
      )

    const findAction = (fs: DownloadInto[]) =>
      pipe(
        fs,
        A.map(([path, file]) => [[path, file], fa(path)] as const),
        A.filterMap(([a, action]) => action === 'overwright' ? O.some(a) : O.none),
      )

    return {
      downloadable: findAction(downloadable),
      empties: findAction(empties),
    }
  }
