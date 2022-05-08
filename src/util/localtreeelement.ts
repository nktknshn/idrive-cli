import { FsStats } from './fs'

export type LocalTreeElement =
  | {
    readonly type: 'file'
    path: string
    name: string
    stats: FsStats
  }
  | {
    readonly type: 'directory'
    path: string
    name: string
    stats: FsStats
  }
