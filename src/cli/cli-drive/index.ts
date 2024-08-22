import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as w from 'yargs-command-wrapper'
import * as Action from './actions'
import { Args, cmd } from './args'
import { driveAction } from './cli-drive-action'

const handler = w.createHandlerFor(cmd, {
  ls: driveAction(Action.listUnixPath),
  mkdir: driveAction(Action.mkdir),
  rm: driveAction(Action.rm),
  upload: cmd => driveAction(Action.upload)(cmd),
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

/** Aggregate all dependencies of all actions into  */
export type ActionsDeps = ReturnType<typeof handler.handle> extends RTE.ReaderTaskEither<infer R, infer A, infer B> ? R
  : never
