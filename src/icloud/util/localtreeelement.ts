import { Stats } from 'fs'

export type LocalTreeElement =
  | {
    readonly type: 'file'
    path: string
    name: string
    stats: Stats
  }
  | {
    readonly type: 'directory'
    path: string
    name: string
    stats: Stats
  }
