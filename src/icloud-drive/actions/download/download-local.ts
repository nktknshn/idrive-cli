import * as A from 'fp-ts/lib/Array'
import { constVoid, flow, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { DepFs } from '../../../deps-types'
import { loggerIO } from '../../../logging/loggerIO'
import { isEexistError } from '../../../util/fs/isEnoentError'
import { DownloadTaskMapped } from './types'

export const createLocalDirStruct = (
  dirs: string[],
): RTE.ReaderTaskEither<DepFs<'mkdir'>, Error, void> =>
  ({ fs: { mkdir: mkdirTask } }) => {
    const mkdir = flow(
      mkdirTask,
      TE.orElseW(e =>
        isEexistError(e)
          ? TE.of(constVoid())
          : TE.left(e)
      ),
    )

    return pipe(
      pipe(dirs, A.map(mkdir)),
      TE.sequenceSeqArray,
      TE.map(constVoid),
    )
  }

export const createEmpties = (
  { empties }: DownloadTaskMapped,
): RTE.ReaderTaskEither<DepFs<'writeFile'>, Error, void> =>
  pipe(
    empties.length > 0
      ? pipe(
        RTE.ask<DepFs<'writeFile'>>(),
        RTE.chainFirstIOK(() => loggerIO.debug(`creating empty ${empties.length} files`)),
        RTE.chainW(({ fs: { writeFile } }) =>
          pipe(
            empties.map(_ => _.localpath),
            A.map(path => writeFile(path, '')),
            A.sequence(TE.ApplicativePar),
            RTE.fromTaskEither,
          )
        ),
        RTE.map(constVoid),
      )
      : RTE.of(constVoid()),
  )
