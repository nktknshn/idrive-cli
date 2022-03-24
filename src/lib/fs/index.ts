import * as TE from 'fp-ts/TaskEither'
import { Dir, MakeDirectoryOptions, Mode, PathLike, Stats } from 'fs'
import * as fs from 'fs/promises'
import { err } from '../errors'

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

export const mkdir = TE.tryCatchK(fs.mkdir, (e) => e instanceof Error ? e : err(`error fs.mkdir: ${e}`))

export const writeFile = TE.tryCatchK(
  fs.writeFile,
  (e) => e instanceof Error ? e : err(`error fs.writeFile: ${e}`),
)

export const readFile = (path: PathLike) =>
  TE.tryCatch(
    () => fs.readFile(path),
    (e) => e instanceof Error ? e : err(`error fs.readFile: ${e}`),
  )

export type DepFsType = {
  fstat(path: string): TE.TaskEither<Error, Stats>
  opendir: (path: string) => TE.TaskEither<Error, Dir>
  writeFile: (path: string, data: string) => TE.TaskEither<Error, void>
  mkdir: (
    path: PathLike,
    options?: Mode | MakeDirectoryOptions | null | undefined,
  ) => TE.TaskEither<Error, string | undefined>
  readFile: (path: PathLike) => TE.TaskEither<Error, Buffer>
}

export type DepFs<K extends keyof DepFsType, RootKey extends string | number | symbol = 'fs'> = Record<
  RootKey,
  Pick<DepFsType, K>
>
// export type DepFsS<KS extends keyof DepFsType> = Pick<DepFsType, KS>
// KS extends [infer K, ...infer Rest]
//   ? K extends keyof DepFsType ? DepFs<K> & (Rest extends (keyof DepFsType)[] ? DepFsS<Rest> : {}) : never
//   : {}

/* KS extends [infer K, ...infer Rest]
  ? K extends keyof DepFsType
    ? Rest extends (keyof DepFsType)[] ? DepFs<K> & DepFsS<Rest> : Rest extends unknown[] ? DepFs<K> : never
  : never
  : never
 */
type A = Pick<DepFsType, 'fstat' | 'writeFile'>
