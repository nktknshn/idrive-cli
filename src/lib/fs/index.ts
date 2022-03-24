import * as TE from 'fp-ts/TaskEither'
import { Dir, MakeDirectoryOptions, Mode, PathLike, Stats } from 'fs'
import * as fs from 'fs/promises'
import { err } from '../errors'

export type FsType = {
  fstat(path: string): TE.TaskEither<Error, Stats>
  opendir: (path: string) => TE.TaskEither<Error, Dir>
  writeFile: (path: string, data: string) => TE.TaskEither<Error, void>
  mkdir: (
    path: PathLike,
    options?: Mode | MakeDirectoryOptions | null | undefined,
  ) => TE.TaskEither<Error, string | undefined>
  readFile: (path: PathLike) => TE.TaskEither<Error, Buffer>
}

export type DepFs<
  K extends keyof FsType,
  RootKey extends string | number | symbol = 'fs',
> = Record<
  RootKey,
  Pick<FsType, K>
>

export const opendir = (path: string) =>
  TE.tryCatch(
    () => fs.opendir(path),
    reason => err(`cant open dir ${reason}`),
  )

export const fstat = (path: string) =>
  TE.tryCatch(
    () => fs.stat(path),
    (e) => e instanceof Error ? e : err(`error getting stats: ${e}`),
  )

export const mkdir = TE.tryCatchK(
  fs.mkdir,
  (e) => e instanceof Error ? e : err(`error fs.mkdir: ${e}`),
)

export const writeFile = TE.tryCatchK(
  fs.writeFile,
  (e) => e instanceof Error ? e : err(`error fs.writeFile: ${e}`),
)

export const readFile = (path: PathLike) =>
  TE.tryCatch(
    () => fs.readFile(path),
    (e) => e instanceof Error ? e : err(`error fs.readFile: ${e}`),
  )
