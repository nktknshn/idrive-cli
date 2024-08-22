import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as w from 'yargs-command-wrapper'
import { CliCommands, cmd } from './args'
import { driveCommand } from './command'
import * as Action from './commands'

const handler = w.createHandlerFor(cmd, {
  ls: driveCommand(Action.listUnixPath),
  mkdir: driveCommand(Action.mkdir),
  rm: driveCommand(Action.rm),
  upload: cmd => driveCommand(Action.upload)(cmd),
  mv: driveCommand(Action.move),
  autocomplete: driveCommand(Action.autocomplete),
  ac: driveCommand(Action.autocomplete),
  cat: driveCommand(Action.cat),
  recover: driveCommand(Action.recover),
  download: driveCommand(Action.download),
  edit: driveCommand(Action.edit),
  init: Action.initSession,
  auth: Action.authSession,
})

export const runCliCommand = (command: CliCommands): RTE.ReaderTaskEither<CommandsDeps, Error, unknown> => {
  return handler.handle(command)
}

/** Aggregate all dependencies of all commands into a single record */
export type CommandsDeps = ReturnType<typeof handler.handle> extends RTE.ReaderTaskEither<infer R, unknown, unknown> ? R
  : never
