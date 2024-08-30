import * as TE from 'fp-ts/TaskEither'
import { Dir, MakeDirectoryOptions, Mode, PathLike } from 'fs'
import { createWriteStream } from 'fs'
import * as fs from 'fs/promises'
import { err } from '../errors'
import { isErrorWithCode } from './is-enoent-error'

export class FsError extends Error {
  readonly type = 'FsError'
  constructor(message: string, public readonly code?: string) {
    super(message)
  }

  static create(message: string, code?: string): FsError {
    return new FsError(message, code)
  }

  static fromError(e: Error, message?: string): FsError {
    let msg = e.message

    if (message !== undefined) {
      msg += ': ' + message
    }

    if (isErrorWithCode(e)) {
      return FsError.create(msg, e.code)
    }

    return FsError.create(msg)
  }

  static is = (e: unknown): e is FsError => e instanceof FsError
}

export type FsStats = {
  isFile(): boolean
  isDirectory(): boolean
  size: number
}

export type FsType = {
  fstat: (path: string) => TE.TaskEither<Error, FsStats>
  opendir: (path: string) => TE.TaskEither<Error, Dir>
  writeFile: (path: string, data: string) => TE.TaskEither<Error, void>
  mkdir: (
    path: PathLike,
    options?: Mode | MakeDirectoryOptions | null | undefined,
  ) => TE.TaskEither<Error, string | undefined>
  readFile: (path: PathLike) => TE.TaskEither<Error, Buffer>
  createWriteStream: typeof createWriteStream
  rm: (path: string) => TE.TaskEither<Error, void>
}

export const opendir = (path: string): TE.TaskEither<Error, Dir> =>
  TE.tryCatch(
    () => fs.opendir(path),
    reason => err(`cant open dir ${reason}`),
  )

export const fstat = (path: string): TE.TaskEither<Error, import('fs').Stats> =>
  TE.tryCatch(
    () => fs.stat(path),
    (e) => isErrorWithCode(e) ? FsError.fromError(e, 'fs.fstat') : err(`fs.fstat: ${e}`),
  )

export const mkdir = TE.tryCatchK(
  fs.mkdir,
  (e) => e instanceof Error ? e : err(`error fs.mkdir: ${e}`),
)

export const writeFile = TE.tryCatchK(
  fs.writeFile,
  (e) => e instanceof Error ? e : err(`error fs.writeFile: ${e}`),
)

export const readFile = (path: PathLike): TE.TaskEither<Error, Buffer> =>
  TE.tryCatch(
    () => fs.readFile(path),
    (e) => isErrorWithCode(e) ? FsError.fromError(e, 'fs.readFile') : err(`fs.readFile: ${e}`),
  )

export const rm = (path: string): TE.TaskEither<Error, void> =>
  TE.tryCatch(
    () => fs.rm(path),
    (e) => e instanceof Error ? e : err(`error fs.rm: ${e}`),
  )

export { createWriteStream }
export { assertFileSize } from './check'
