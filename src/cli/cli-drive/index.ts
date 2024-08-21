import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as w from 'yargs-command-wrapper'
import { Args, cmd } from './args'
import { driveAction } from './cli-drive-action'
import * as Action from './cli-drive-actions'

const handler = w.createHandlerFor(cmd, {
  ls: driveAction(Action.listUnixPath),
  mkdir: driveAction(Action.mkdir),
  rm: driveAction(Action.rm),
  upload: a => driveAction(Action.upload)(a),
  mv: driveAction(Action.move),
  autocomplete: driveAction(Action.autocomplete),
  ac: driveAction(Action.autocomplete),
  cat: driveAction(Action.cat),
  recover: driveAction(Action.recover),
  download: driveAction(Action.download),
  edit: driveAction(Action.edit),
  init: Action.initSession,
  auth: Action.authSession,
})

export const runCliAction = (action: Args): RTE.ReaderTaskEither<ActionsDeps, Error, unknown> => {
  return handler.handle(action)
}

export type ActionsDeps = Args extends (...args: infer _) => RTE.ReaderTaskEither<infer R, infer _, infer _> ? R
  : never
