import { flow } from 'fp-ts/lib/function'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { defaultApiEnv, defaultCacheFile, defaultFileEditor, defaultSessionFile, defaultTempDir } from '../../defaults'
import { defaultApiCreator } from '../../icloud/drive/deps/api-creator'
import * as fs from '../../util/fs'
import { askConfirmation } from '../../util/prompts'
import { isKeyOf } from '../../util/util'
import { cliAction } from './cli-drive-action'
import * as Action from './cli-drive-actions'

const cliActions = {
  ls: Action.listUnixPath,
  mkdir: Action.mkdir,
  rm: Action.rm,
  // upload: Action.upload,
  upload: Action.uploads,
  mv: Action.move,
  autocomplete: Action.autocomplete,
  ac: Action.autocomplete,
  cat: Action.cat,
  recover: Action.recover,
  download: Action.download,
  edit: Action.edit,
  uf: Action.uploadFolder,
  init: SRTE.fromReaderTaskEitherK(Action.initSession),
}

type ActionsKeys = keyof typeof cliActions

type ActionsArgvTuples = ActionsKeys extends infer K
  ? K extends keyof typeof cliActions ? (typeof cliActions)[K] extends (argv: infer _Argv) => infer R ? {
    command: K
    argv: _Argv
  }
  : never
  : never
  : never

type ActionsArgvTuples2 = ActionsKeys extends infer K
  ? K extends keyof typeof cliActions ? (typeof cliActions)[K] extends (argv: infer _Argv) => infer R ? {
    action: typeof cliActions[K]
    argv: _Argv
  }
  : never
  : never
  : never

export const cliActionsDeps = (argv: {
  sessionFile?: string
  cacheFile?: string
  noCache?: boolean
  tempdir?: string
  fileEditor?: string
}) => ({
  api: defaultApiCreator(defaultApiEnv),
  fs,
  ...defaultApiEnv,
  sessionFile: argv.sessionFile ?? defaultSessionFile,
  cacheFile: argv.cacheFile ?? defaultCacheFile,
  noCache: argv.noCache ?? false,
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

  return cliAction<unknown, ActionsDeps, [ActionsArgv & { skipLogin: boolean }]>(cliActions[action])
}

export const runCliAction2 = (
  action: ActionsArgvTuples,
) => {
  if (action.command === 'init') {
    return Action.initSession(action.argv)
  }

  const act = cliActions[action.command]

  return cliAction<unknown, ActionsDeps, [ActionsArgv]>(
    act,
  )(action.argv as any)
}

export const isValidAction = (action: unknown): action is ValidAction =>
  typeof action === 'string' && isKeyOf(cliActions, action) || action === 'init'

type ValidAction = (keyof typeof cliActions | 'init')

type Actions = typeof cliActions extends { [key: string]: infer V } ? V : never

type ActionsDeps = Actions extends
  (...args: infer Args) => (state: infer S) => RTE.ReaderTaskEither<infer R, infer E, infer A> ? R
  : never

type ActionsArgv = Actions extends
  (...args: infer Args) => (state: infer S) => RTE.ReaderTaskEither<infer R, infer E, infer A> ? Args[0]
  : never

// type A = ActionsArgv['s']
