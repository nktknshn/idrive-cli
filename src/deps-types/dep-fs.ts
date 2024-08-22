import { FsType } from '../util/fs'

/** Functions to access file system */
export type DepFs<
  K extends keyof FsType,
  RootKey extends string | number | symbol = 'fs',
> = Record<RootKey, Pick<FsType, K>>
