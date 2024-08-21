import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import { isKeyOf } from '../../util/guards'
import { driveAction } from './cli-drive-action'
import * as Action from './cli-drive-actions'

const cliActions = {
  ls: driveAction(Action.listUnixPath),
  mkdir: driveAction(Action.mkdir),
  rm: driveAction(Action.rm),
  upload: driveAction(Action.upload),
  mv: driveAction(Action.move),
  autocomplete: driveAction(Action.autocomplete),
  ac: driveAction(Action.autocomplete),
  cat: driveAction(Action.cat),
  recover: driveAction(Action.recover),
  download: driveAction(Action.download),
  edit: driveAction(Action.edit),
  init: Action.initSession,
  auth: Action.authSession,
}

export const runCliAction = (
  action: ActionsArgvTuples,
): RTE.ReaderTaskEither<ActionsDeps, Error, unknown> => {
  // if (action.command === 'init') {
  //   return Action.initSession(action.argv)
  // }
  return cliActions[action.command](action.argv as any)
  // return cliActions[action.command](action.argv)
  // return cliAction<unknown, ActionsDeps, [ActionsArgv]>(
  //   cliActions[action.command],
  // )(action.argv as any)
}

export const isValidAction = (action: unknown): action is ValidAction =>
  typeof action === 'string' && isKeyOf(cliActions, action) || action === 'init'

type ActionsKeys = keyof typeof cliActions

type ActionsArgvTuples = ActionsKeys extends infer K
  ? K extends keyof typeof cliActions ? (typeof cliActions)[K] extends (argv: infer _Argv) => infer R ? {
    command: K
    argv: _Argv
  }
  : never
  : never
  : never

type ValidAction = (keyof typeof cliActions | 'init')

type Actions = typeof cliActions extends { [key: string]: infer V } ? V : never

export type ActionsDeps = Actions extends (...args: infer Args) => RTE.ReaderTaskEither<infer R, infer E, infer A> ? R
  : never
