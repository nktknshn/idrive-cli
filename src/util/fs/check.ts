import { constVoid, pipe } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as TE from 'fp-ts/TaskEither'
import { DepFs } from '../../deps-types/dep-fs'
import { FileInvalidError, FileNotFoundError } from '../errors'
import { isEnoentError } from './is-enoent-error'

type Deps = DepFs<'fstat'>

export class FileSizeError extends Error {
  readonly tag = 'FileSizeError'
  constructor(public readonly message: string) {
    super(message)
  }

  static is(a: Error): a is FileSizeError {
    return a instanceof FileSizeError
  }

  static create(path: string): FileSizeError {
    return new FileSizeError(path)
  }
}

export const assertFileSize = (
  { path, minimumSize, maximumSize = Infinity }: {
    path: string
    minimumSize: number
    maximumSize?: number
  },
): RTE.ReaderTaskEither<Deps, Error, void> =>
  ({ fs }) =>
    pipe(
      fs.fstat(path),
      TE.mapLeft(e => isEnoentError(e) ? FileNotFoundError.create(path) : e),
      TE.chain(a =>
        a.isFile()
          ? TE.right(a)
          : TE.left(FileInvalidError.create(path))
      ),
      TE.chain(a =>
        a.size >= minimumSize && a.size <= maximumSize
          ? TE.right(constVoid())
          : TE.left(FileSizeError.create(`File size ${a.size} is not in range [${minimumSize}, ${maximumSize}].`))
      ),
    )
