import * as E from 'fp-ts/Either'
import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/function'
import * as RT from 'fp-ts/lib/ReaderTask'
import * as TE from 'fp-ts/lib/TaskEither'
import * as RA from 'fp-ts/ReadonlyArray'
import * as Task from 'fp-ts/Task'
import { DepFs } from '../../../deps-types'
import { logger } from '../../../logging/logging'
import { FsStats } from '../../../util/fs'
import { isEnoentError } from '../../../util/fs/is-enoent-error'
import { LocalTreeElement } from '../../../util/localtreeelement'
import { Path } from '../../../util/path'
import { DownloadItemMapped, DownloadTaskMapped } from './types'

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

export const lookForLocalConflicts = (
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
      A.map(handleStatsItem),
      Task.sequenceSeqArray,
      Task.map(RA.toArray),
      Task.map(A.separate),
      Task.map(({ left }) => left),
      RT.fromTask,
    )
  )
}

const handleStatsItem = (
  [stats, item]: (readonly [TE.TaskEither<Error, FsStats>, DownloadItemMapped]),
): TE.TaskEither<Conflict, DownloadItemMapped> =>
  pipe(
    stats,
    TE.match(
      handleError(item),
      handleStats(item),
    ),
  )

const handleError = (item: DownloadItemMapped) =>
  (error: Error): E.Either<Conflict, DownloadItemMapped> => {
    return isEnoentError(error)
      ? E.right(item)
      : E.left({ tag: 'statserror', item, error })
  }

const handleStats = (item: DownloadItemMapped) =>
  (stats: FsStats): E.Either<Conflict, DownloadItemMapped> =>
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
    )

export const showConflict = (conflict: Conflict): string =>
  conflict.tag === 'exists'
    ? `local file ${conflict.item.localpath} (${conflict.localitem.stats.size} bytes) conflicts with remote file (${conflict.item.item.remotefile.size} bytes)`
    : `error: ${conflict.error}`
