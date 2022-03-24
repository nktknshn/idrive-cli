import { flow, pipe } from 'fp-ts/lib/function'
import * as R from 'fp-ts/lib/Reader'
import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import * as TE from 'fp-ts/lib/TaskEither'
import { defaultApiEnv } from '../../defaults'
import { apiCreator } from '../../icloud/drive/deps/api-creator'
import { failingFetch } from '../../lib/http/fetch-client'
import { printer } from '../../lib/logging'
import { isKeyOf } from '../../lib/util'
import { driveAction, DriveActionDeps } from '../cli-action'
import * as Action from './cli-drive-actions'
import { cliActionsDependancies } from './cli-drive-deps'

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

type ValidCommand = (keyof typeof driveActions | 'init')

type LLLL = typeof driveActions extends { [key: string]: infer V } ? V : never

type ActionsDeps = LLLL extends (...args: infer Args) => SRTE.StateReaderTaskEither<infer S, infer R, infer E, infer A>
  ? R
  : never

type ActionsArgv = LLLL extends (...args: infer Args) => SRTE.StateReaderTaskEither<infer S, infer R, infer E, infer A>
  ? Args[0]
  : never

export const runCommand = (
  command: ValidCommand,
) => {
  const deps = pipe(
    {
      ...defaultApiEnv,
      apiCreator,
      fetchClient: failingFetch(90),
    },
    cliActionsDependancies(),
  )

  if (command === 'init') {
    return (argv: { sessionFile: string }) =>
      pipe(
        Action.initSession()({ ...deps, ...argv }),
      )
  }

  return (
    argv: ActionsArgv & Omit<ActionsDeps & DriveActionDeps, keyof (typeof deps & ActionsArgv)>,
  ) =>
    pipe(
      { ...deps, ...argv },
      driveAction<unknown, ActionsDeps>(
        () => driveActions[command](argv),
      ),
    )
}

export const isValidCommand = (command: string): command is ValidCommand =>
  isKeyOf(driveActions, command) || command === 'init'
