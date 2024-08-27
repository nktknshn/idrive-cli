import * as RTE from 'fp-ts/lib/ReaderTaskEither'
import * as w from 'yargs-command-wrapper'
import { CliCommands, cmd } from './args'
import { driveCommand } from './command'
import * as Commands from './commands'

const handler = w.createHandlerFor(cmd, {
  ls: driveCommand(Commands.listUnixPath),
  mkdir: driveCommand(Commands.mkdir),
  rm: driveCommand(Commands.rm),
  upload: cmd => driveCommand(Commands.upload)(cmd),
  mv: driveCommand(Commands.move),
  autocomplete: driveCommand(Commands.autocomplete),
  ac: driveCommand(Commands.autocomplete),
  cat: driveCommand(Commands.cat),
  recover: driveCommand(Commands.recover),
  download: driveCommand(Commands.download),
  edit: driveCommand(Commands.edit),
  init: Commands.initSession,
  auth: Commands.authSession,
})

export const runCliCommand = (command: CliCommands): RTE.ReaderTaskEither<CommandsDeps, Error, unknown> => {
  return handler.handle(command)
}

/** Aggregate all dependencies of all commands into a single record */
export type CommandsDeps = ReturnType<typeof handler.handle> extends RTE.ReaderTaskEither<infer R, unknown, unknown> ? R
  : never
