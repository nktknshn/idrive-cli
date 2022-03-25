import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { defaultApiEnv, defaultFileEditor, defaultTempDir } from '../../defaults'
import { defaultApiCreator } from '../../icloud/drive/deps/api-creator'
import * as fs from '../../lib/fs'
import { askConfirmation } from '../../lib/prompts'
import { isKeyOf } from '../../lib/util'
import { cliAction } from '../cli-action'
import * as Action from './cli-drive-actions'

const driveActions = {
  ls: Action.listUnixPath,
  mkdir: Action.mkdir,
  rm: Action.rm,
  upload: Action.upload,
  uploads: Action.uploads,
  mv: Action.move,
  autocomplete: Action.autocomplete,
  ac: Action.autocomplete,
  cat: Action.cat,
  recover: Action.recover,
  download: Action.download,
  edit: Action.edit,
  df: Action.downloadFolder,
  uf: Action.uploadFolder,
}

export const cliActionDeps = (argv: {
  sessionFile: string
  cacheFile: string
  noCache: boolean
  tempdir?: string
  fileEditor?: string
}) => ({
  api: defaultApiCreator(defaultApiEnv),
  fs,
  ...defaultApiEnv,
  sessionFile: argv.sessionFile,
  cacheFile: argv.cacheFile,
  noCache: argv.noCache,
  askConfirmation,
  tempdir: argv.tempdir ?? defaultTempDir,
  fileEditor: argv.fileEditor ?? defaultFileEditor,
})

export const runCliAction = (
  action: ValidAction,
) => {
  if (action === 'init') {
    return Action.initSession
  }

  return cliAction<unknown, ActionsDeps, [ActionsArgv & { skipLogin: boolean }]>(driveActions[action])
}

export const isValidAction = (action: unknown): action is ValidAction =>
  typeof action === 'string' && isKeyOf(driveActions, action) || action === 'init'

type ValidAction = (keyof typeof driveActions | 'init')

type Actions = typeof driveActions extends { [key: string]: infer V } ? V : never

type ActionsDeps = Actions extends
  (...args: infer Args) => SRTE.StateReaderTaskEither<infer S, infer R, infer E, infer A> ? R
  : never

type ActionsArgv = Actions extends
  (...args: infer Args) => SRTE.StateReaderTaskEither<infer S, infer R, infer E, infer A> ? Args[0]
  : never
