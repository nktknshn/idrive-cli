import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as w from 'yargs-command-wrapper'
import { driveAction } from './action'
import * as Action from './actions'
import { CliCommands, cmd } from './args'

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

export const runCliCommand = (command: CliCommands): RTE.ReaderTaskEither<CommandsDeps, Error, unknown> => {
  return handler.handle(command)
}

/** Aggregate all dependencies of all commands into a single record */
export type CommandsDeps = ReturnType<typeof handler.handle> extends RTE.ReaderTaskEither<infer R, unknown, unknown> ? R
  : never
