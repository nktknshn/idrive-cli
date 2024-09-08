import { hole } from 'fp-ts/lib/function'
import { PathLike } from 'fs'
import { FsType } from '../../../src/util/fs'

export const mockedFs = (): FsType => ({
  fstat: (path: string) => hole(),
  createWriteStream: (path: PathLike) => hole(),
  mkdir: (path: PathLike) => hole(),
  opendir: (path: string) => hole(),
  readFile: (path: PathLike) => hole(),
  writeFile: (path: string) => hole(),
  rm: (path: PathLike) => hole(),
  createReadStream: (path: PathLike) => hole(),
})
