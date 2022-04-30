import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as SRTE from 'fp-ts/lib/StateReaderTaskEither'
import { isKeyOf } from '../../util/guards'
import { cliAction } from './cli-drive-action'
import * as Action from './cli-drive-actions'

const cliActions = {
  ls: cliAction(Action.listUnixPath),
  mkdir: cliAction(Action.mkdir),
  rm: cliAction(Action.rm),
  upload: cliAction(Action.upload),
  mv: cliAction(Action.move),
  autocomplete: cliAction(Action.autocomplete),
  ac: cliAction(Action.autocomplete),
  cat: cliAction(Action.cat),
  recover: cliAction(Action.recover),
  download: cliAction(Action.download),
  edit: cliAction(Action.edit),
  init: Action.initSession,
}

const rteCliActions = {
  init: Action.initSession,
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

type ActionsArgv = Actions extends
  (...args: infer Args) => (state: infer S) => RTE.ReaderTaskEither<infer R, infer E, infer A> ? Args[0]
  : never

type RteActionsKeys = keyof typeof rteCliActions

type RteActionsArgvTuples = ActionsKeys extends infer K
  ? K extends keyof typeof rteCliActions ? (typeof rteCliActions)[K] extends (argv: infer _Argv) => infer R ? {
    command: K
    argv: _Argv
  }
  : never
  : never
  : never

type RteValidAction = keyof typeof rteCliActions

type RteActions = typeof rteCliActions extends { [key: string]: infer V } ? V : never

type RteActionsDeps = RteActions extends (...args: infer Args) => RTE.ReaderTaskEither<infer R, infer E, infer A> ? R
  : never

type RteActionsArgv = RteActions extends (...args: infer Args) => RTE.ReaderTaskEither<infer R, infer E, infer A>
  ? Args[0]
  : never

// type A = ActionsArgv['s']
